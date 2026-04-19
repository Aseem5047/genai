import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import ora from "ora";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const tavily_client = tavily({
    apiKey: process.env.TAVILY_API_KEY,
});

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const SYSTEM_PROMPT = `
You are a smart assistant.

- You can use the tool "web_search" if needed.

- If a tool returns status: "error", you may retry or answer with "uncertain".

- When giving the final answer, return ONLY valid JSON:

{
    "status": "success" | "error" | "uncertain",
    "message": string,
    "sources": string[]
}
`;

// ========================
// STEP LOGGER
// ========================
function step(spinner, msg) {
    if (spinner.isSpinning) {
        spinner.stopAndPersist({ symbol: "›", text: spinner.text });
    }
    spinner.start(msg);
}

// ========================
// SAFE JSON PARSER
// ========================
function safeParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch {
        return {
            status: "error",
            message: "Invalid JSON from model",
            raw: text,
        };
    }
}

// ========================
// LLM CALL
// ========================
async function callLLM(messages, tools, allowTools = true) {
    return groq.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages,
        tools,
        tool_choice: allowTools ? "auto" : "none",
    });
}

// ========================
// WEB SEARCH TOOL
// ========================
async function webSearch(query) {
    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
            },
            body: JSON.stringify({
                query,
                search_depth: "advanced",
                include_answer: true,
            }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        return {
            status: "success",
            answer: data.answer || "",
            results: data.results?.slice(0, 3) || [],
        };

    } catch (primaryError) {
        try {
            const data = await tavily_client.search({
                query,
                search_depth: "advanced",
            });

            return {
                status: "success",
                answer: data.answer || "",
                results: data.results?.slice(0, 3) || [],
                fallback: true,
            };

        } catch (fallbackError) {
            return {
                status: "error",
                message: "Both primary and fallback search failed",
                details: {
                    primary: primaryError.message,
                    fallback: fallbackError.message,
                },
            };
        }
    }
}

// ========================
// TOOL HANDLERS
// ========================
const toolHandlers = {
    web_search: async ({ query }) => webSearch(query),
};

// ========================
// TOOL DEFINITIONS
// ========================
const tools = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web for up-to-date information",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string" },
                },
                required: ["query"],
            },
        },
    },
];

// ========================
// MAIN AGENT LOOP
// ========================
async function runAgent(question, spinner) {
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
    ];

    let steps = 0;
    const MAX_STEPS = 5;
    const MAX_SEARCHES = 2;
    let searchCount = 0;
    let justCalledTools = false;

    while (steps++ < MAX_STEPS) {
        step(spinner, `Thinking ... (step ${steps})`);

        let response;
        try {
            // both checks: justCalledTools prevents the 400 error,
            // searchCount caps total searches across the run
            const allowTools = !justCalledTools && searchCount < MAX_SEARCHES;
            response = await callLLM(messages, tools, allowTools);
        } catch (err) {
            spinner.fail("LLM call failed");
            return {
                status: "error",
                message: "LLM call failed",
                sources: [],
                query: question,
                steps_taken: steps,
                details: err.message,
            };
        }

        const msg = response.choices[0].message;
        messages.push(msg);
        justCalledTools = false;  // reset every iteration

        // Final answer
        if (!msg.tool_calls) {
            step(spinner, "Processing final answer ...");
            const parsed = safeParseJSON(msg.content);

            if (parsed.raw) {
                step(spinner, "LLM is thinking, continuing ...");
                continue;
            }

            if (["success", "error"].includes(parsed.status)) {
                spinner.succeed("Done");
                return { ...parsed, query: question, steps_taken: steps };
            }

            if (parsed.status === "uncertain") {
                step(spinner, "Uncertain, continuing ...");
                messages.push({
                    role: "user",
                    content: "You are not done. Continue reasoning or use tools."
                });
                continue;
            }
        }

        // Tool calls
        for (const toolCall of msg.tool_calls) {
            const { name, arguments: argsStr } = toolCall.function;

            step(spinner, `Using tool: ${name}`);

            // increment search count for budget tracking
            if (name === "web_search") searchCount++;

            let args;
            try {
                args = JSON.parse(argsStr);
            } catch {
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({
                        status: "error",
                        message: "Invalid tool arguments",
                    }),
                });
                continue;
            }

            const handler = toolHandlers[name];

            if (!handler) {
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({
                        status: "error",
                        message: `No handler for tool: ${name}`,
                    }),
                });
                continue;
            }

            let result;
            try {
                result = await handler(args);
            } catch (err) {
                result = {
                    status: "error",
                    message: "Tool execution failed",
                    details: err.message,
                };
            }

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: name,
                content: JSON.stringify(result),
            });
        }

        // nudge the model to decide whether to search again or answer
        messages.push({
            role: "user",
            content: searchCount < MAX_SEARCHES
                ? "Do you need to search for anything else? If yes, call the tool. If you have enough, return ONLY valid JSON."
                : "You have used all your searches. Return ONLY valid JSON now.",
        });

        justCalledTools = true;  // set after all tool calls are processed
    }

    spinner.fail("Max steps exceeded");
    return {
        status: "error",
        message: "Max steps exceeded",
        sources: [],
        query: question,
        steps_taken: steps,
    };
}

// ========================
// RETRY WRAPPER
// ========================
async function runWithRetry(retries = 3) {
    const question = "What's the price of iPhone 17 Pro Max?";
    const spinner = ora("Starting agent ...").start();

    for (let i = 0; i < retries; i++) {
        try {
            step(spinner, `Attempt ${i + 1} ...`);
            const result = await runAgent(question, spinner);
            console.log(result);
            return result;
        } catch (err) {
            spinner.warn(`Attempt ${i + 1} failed`);

            if (i === retries - 1) {
                spinner.fail("All retries failed");
                return {
                    status: "error",
                    message: "All retries failed",
                    sources: [],
                    query: question,
                };
            }
        }
    }
}

// ========================
// RUN
// ========================
runWithRetry();

/*

⠋ Starting agent...
⠙ Attempt 1...
⠹ Thinking... (step 1)
⠸ Using tool: web_search
⠼ Thinking... (step 2)
⠴ Processing final answer...
✔ Done

{
  "status": "success"
  "message": "The current price of Bitcoin is approximately $67,450 USD.",
}

 */