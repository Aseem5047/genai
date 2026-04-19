import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import ora from "ora";
import readline from "readline";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";

marked.setOptions({ renderer: new TerminalRenderer() });

function renderMessage(text) {
    let formatted = text;

    formatted = formatted.replace(/^TITLE: (.*)$/gm, "\n## $1");
    formatted = formatted.replace(/^SECTION: (.*)$/gm, "\n### $1");
    formatted = formatted.replace(/^POINT: (.*)$/gm, "\n• $1");

    return marked(formatted);
}

function printResult(result) {
    console.log("\n");
    console.log(renderMessage(result.message));

    if (result.sources?.length) {
        console.log("Sources:\n");
        result.sources.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    }

    console.log("\n─────────────────────────────────────────");
    console.log(`  Status     : ${result.status}`);
    console.log(`  Steps      : ${result.steps_taken}`);
    console.log(`  Query      : ${result.query}`);
    console.log("─────────────────────────────────────────\n");
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const tavily_client = tavily({
    apiKey: process.env.TAVILY_API_KEY,
});

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

const SYSTEM_PROMPT = `
You are a precise and reliable research assistant with access to real-time web search.

========================================
CORE BEHAVIOR
========================================
- Always prefer verified information over guesses.
- If information is missing, incomplete, or uncertain, explicitly say so.
- Never fabricate facts.

========================================
WHEN TO USE SEARCH
========================================
Use web search when the query involves:
- Current or dynamic data (prices, news, releases, statistics)
- Specific entities (products, companies, people)
- Comparisons or detailed specifications

========================================
SEARCH STRATEGY
========================================
- For comparisons:
  - Search each entity separately
  - Example:
    Search 1: "[product A] full specs price"
    Search 2: "[product B] full specs price"

- Do NOT combine multiple entities into one search query.

- If initial results are weak or insufficient:
  - Reformulate the query using alternative strategies:
    - "[product] specs"
    - "[product] features"
    - "[product] leaks"
    - "[product] expected features"
    - "[product] vs [competitor]"

- Always adapt queries if results are poor. Never repeat the same query.

========================================
HANDLING WEAK OR MISSING DATA
========================================
- If tool returns "weak":
  - Results are insufficient or low quality
  - You MUST retry with a better query

- If a product is unreleased or poorly documented:
  - Clearly state it is not officially announced
  - Use leaks, rumors, or expected specs
  - Still provide the best possible comparison

- You are NOT allowed to stop at "information not found"

========================================
SEARCH LIMITS
========================================
- Maximum 2 searches per response
- Use them strategically
- Prefer improving query quality over repeating queries

========================================
RESPONSE STRUCTURE
========================================
- Start with a direct answer
- Then expand with supporting details
- Minimum length: 150 words for non-trivial queries

Use the following structure markers:

TITLE: ...
SECTION: ...
POINT: ...

Formatting rules:
- Plain text only
- Use \\n for line breaks
- Do NOT use markdown, symbols, or formatting characters

========================================
COMPLETENESS REQUIREMENTS
========================================
- For comparisons:
  - BOTH entities must be covered
  - If one is missing, you MUST search again

- Provide the best possible answer even with partial data

========================================
OUTPUT FORMAT (STRICT)
========================================
Return ONLY valid JSON:

{
  "status": "success" | "uncertain" | "error" | "weak",
  "message": string,
  "sources": string[]
}

========================================
STATUS DEFINITIONS
========================================
- success   → complete and reliable answer
- uncertain → partial or conflicting information
- weak      → search results insufficient (must retry)
- error     → cannot answer after all attempts

========================================
MESSAGE RULES
========================================
- Clear, natural language
- No markdown or special formatting
- Use \\n for line breaks

========================================
SOURCES RULES
========================================
- Include only relevant, supporting URLs
- Minimum 2 sources if search is used
- Omit sources if no search was needed

========================================
EXAMPLES
========================================

Factual:
{
  "status": "success",
  "message": "TITLE: Population of Tokyo\n\nSECTION: Overview\nTokyo is the most populous metropolitan area in the world, with over 37 million people.\n\nSECTION: Context\nThis includes the wider metropolitan region spanning multiple prefectures.",
  "sources": ["https://..."]
}

Comparison:
{
  "status": "success",
  "message": "TITLE: Python vs JavaScript for Backend\n\nSECTION: Python\nPOINT: Simple and readable syntax\nPOINT: Strong in data science and AI\n\nSECTION: JavaScript\nPOINT: Same language for frontend and backend\nPOINT: Large ecosystem via npm\n\nSECTION: Verdict\nPython suits data-heavy tasks, JavaScript suits full-stack development.",
  "sources": ["https://...", "https://..."]
}

Uncertain:
{
  "status": "uncertain",
  "message": "TITLE: Future Interest Rates\n\nSECTION: Current State\nRates depend on inflation and economic indicators.\n\nSECTION: Uncertainty\nFuture movements cannot be predicted with certainty.\n\nSECTION: Conclusion\nOnly trends can be estimated, not exact values.",
  "sources": ["https://..."]
}
`;

// ========================
// READLINE INTERFACE
// ========================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(prompt) {
    return new Promise((resolve) => rl.question(prompt, resolve));
}

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
        const cleaned = text
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();

        return JSON.parse(cleaned);

    } catch {
        try {
            // Fix unescaped newlines inside strings
            const fixed = text.replace(/\n/g, "\\n");
            return JSON.parse(fixed);
        } catch {
            return { status: "error", message: "Invalid JSON from model", raw: text };
        }
    }
}

// ========================
// LLM CALL
// ========================
async function callLLM(messages, tools, allowTools = true) {
    return groq.chat.completions.create({
        model: MODEL,
        temperature: 0,
        // response_format: { type: "json_object" },
        messages,
        ...(allowTools && { tools, tool_choice: "auto" }),
    });
}

// ========================
// WEB SEARCH TOOL
// ========================

function isWeakResult(results) {
    if (!results || results.length < 2) return true;

    const weak = results.filter(r =>
        !r.summary || r.summary.length < 100
    );

    return weak.length > results.length * 0.6;
}

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
            status: isWeakResult(data.results) ? "weak" : "success",
            answer: data.answer || "",
            results: data.results?.slice(0, 5).map(r => ({
                title: r.title,
                url: r.url,
                summary: r.content?.slice(0, 500),
            })) || [],
        };

    } catch (primaryError) {
        try {
            const data = await tavily_client.search({
                query,
                search_depth: "advanced",
            });

            return {
                status: isWeakResult(data.results) ? "weak" : "success",
                answer: data.answer || "",
                results: data.results?.slice(0, 5).map(r => ({
                    title: r.title,
                    url: r.url,
                    summary: r.content?.slice(0, 500),
                })) || [],
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
    let forceNoTools = false;
    let previousQueries = [];

    while (steps++ < MAX_STEPS) {
        step(spinner, `Thinking ... (step ${steps})`);

        let response;
        try {
            const allowTools = !justCalledTools && !forceNoTools && searchCount < MAX_SEARCHES;
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
        justCalledTools = false;

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
            step(spinner, "Processing final answer ...");

            const parsed = safeParseJSON(msg.content);

            // JSON FIX
            if (parsed.raw) {
                if (steps >= MAX_STEPS - 1) {
                    return {
                        status: "uncertain",
                        message: "Model returned invalid JSON:\n\n" + parsed.raw,
                        sources: [],
                        query: question,
                        steps_taken: steps
                    };
                }

                messages.push({
                    role: "user",
                    content: "Return ONLY valid JSON with keys: status, message, sources."
                });
                continue;
            }

            // SUCCESS
            if (parsed.status === "success") {
                spinner.succeed("Done");
                return { ...parsed, query: question, steps_taken: steps };
            }

            // WEAK

            if (parsed.status === "weak") {
                if (steps >= MAX_STEPS - 1) {
                    spinner.succeed("Done (best effort with weak data)");
                    return { ...parsed, query: question, steps_taken: steps };
                }

                step(spinner, "Weak results detected, reformulating search ...");

                messages.push({
                    role: "user",
                    content: `
                        The previous search results were weak or insufficient.

                        You MUST:
                        - Reformulate the query using a different strategy
                        - Use shorter or alternative keywords
                        - Try one of:
                        - "[product] specs"
                        - "[product] features"
                        - "[product] leaks"
                        - "[product] expected specs"

                        Do NOT repeat the same query.
                        Then perform another search and return ONLY valid JSON.
                    `
                });

                continue;
            }

            // UNCERTAIN
            if (parsed.status === "uncertain") {
                if (searchCount >= MAX_SEARCHES || steps >= MAX_STEPS - 1) {
                    spinner.succeed("Done (best possible)");
                    return { ...parsed, query: question, steps_taken: steps };
                }

                messages.push({
                    role: "user",
                    content: "Refine your answer using available information. Do NOT call tools unless necessary."
                });
                continue;
            }

            // ERROR
            if (parsed.status === "error") {
                if (steps >= MAX_STEPS - 1 || searchCount >= MAX_SEARCHES) {
                    spinner.fail("Failed");
                    return { ...parsed, query: question, steps_taken: steps };
                }

                messages.push({
                    role: "user",
                    content: "Try a different approach. Return ONLY valid JSON."
                });
                continue;
            }

            // FALLBACK
            forceNoTools = true;
            messages.push({
                role: "user",
                content: "IMPORTANT: Do NOT call tools. Return ONLY valid JSON."
            });
        }

        for (const toolCall of msg.tool_calls) {
            const { name, arguments: argsStr } = toolCall.function;

            if (name === "web_search" && searchCount >= MAX_SEARCHES) {
                step(spinner, `Search budget exhausted, skipping: ${name}`);
                messages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    name: name,
                    content: JSON.stringify({
                        status: "error",
                        message: "Search budget exhausted. Use results already retrieved to answer.",
                    }),
                });
                continue;
            }

            step(spinner, `Using tool: ${name}`);

            if (name === "web_search") searchCount++;

            let args;
            try {
                args = JSON.parse(argsStr);
                previousQueries.push(args.query);
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

            const simplified = {
                status: result.status,
                answer: result.answer,
                key_points: result.results.map(r => r.summary).join("\n\n"),
                sources: result.results.map(r => r.url)
            };

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: name,
                content: JSON.stringify(simplified),
            });
        }

        messages.push({
            role: "user",
            content: searchCount < MAX_SEARCHES
                ? `
                    Evaluate the search results carefully.

                    If the results are weak, incomplete, or missing key data:
                    - You MUST perform another search with a better query

                    If the results are sufficient:
                    - Return the final answer in valid JSON

                    Previous failed queries:
                    ${previousQueries.join("\n")}

                    Do NOT repeat them. Use a different strategy.
                `
                : "You have used all your searches. Return ONLY valid JSON now.",
        });

        if (searchCount >= MAX_SEARCHES) {
            forceNoTools = true;
        }

        justCalledTools = true;
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


async function isResearchQuery(question) {
    const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant", // fast + cheap for classification
        temperature: 0,
        max_completion_tokens: 10,
        // response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: `Classify the input as either "research" or "chat".
- "research": questions, factual queries, comparisons, how-tos, news
- "chat": greetings, small talk, thanks, farewells, identity questions, meta questions about the assistant (e.g., "what can you do", "who are you", etc)
Reply with ONLY one word: research or chat.`
            },
            { role: "user", content: question }
        ]
    });

    const label = response.choices[0].message.content.trim().toLowerCase();
    return label === "research";
}


async function runWithRetry(question, retries = 3) {
    const spinner = ora("Starting agent ...").start();

    for (let i = 0; i < retries; i++) {
        try {
            step(spinner, `Attempt ${i + 1} ...`);
            if (!await isResearchQuery(question)) {
                console.log("\nAssistant: Hey there! Ask me anything — I can search the web and answer questions.\n");
                continue;
            }
            const result = await runAgent(question, spinner);
            printResult(result);
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