import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `
You are a smart assistant.

- You can use the tool "web_search" if needed.
- Do NOT output JSON when calling tools.

- When giving the final answer, return ONLY valid JSON:

{
  "message": string,
  "status": "success" | "error" | "uncertain"
}
`;

// Single reusable LLM call
async function callLLM(messages, tools) {
    return groq.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages,
        tools,
        tool_choice: "auto",
    });
}

// Tavily search
async function webSearch(query) {
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

    const data = await res.json();

    return {
        answer: data.answer,
        results: data.results.slice(0, 3),
    };
}

// Tool handlers
const toolHandlers = {
    web_search: async ({ query }) => webSearch(query),
};

// Tool definitions
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

// Main agent loop
async function runAgent(question) {
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question },
    ];

    let steps = 0;
    const MAX_STEPS = 5;

    while (steps++ < MAX_STEPS) {
        const response = await callLLM(messages, tools);
        const msg = response.choices[0].message;

        messages.push(msg);

        // Final response
        if (!msg.tool_calls) {
            return safeParseJSON(msg.content);
        }

        // Handle tool calls
        for (const toolCall of msg.tool_calls) {
            const { name, arguments: argsStr } = toolCall.function;
            const args = JSON.parse(argsStr);

            const handler = toolHandlers[name];
            if (!handler) {
                throw new Error(`No handler for tool: ${name}`);
            }

            const result = await handler(args);

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
            });
        }
    }

    throw new Error("Max steps exceeded");
}

// Retry wrapper
async function runWithRetry(retries = 3) {
    const question = "What is the current price of Bitcoin?"
    for (let i = 0; i < retries; i++) {
        try {
            const result = await runAgent(question);
            console.log(result);
            return result;
        } catch (err) {
            console.warn(`Attempt ${i + 1} failed`);
            if (i === retries - 1) throw err;
        }
    }
}

runWithRetry();