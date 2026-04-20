import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export async function callLLMWithRetry(messages, tools, allowTools, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await callLLM(messages, tools, allowTools);
        } catch (err) {
            if (i === retries) throw err;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
}

export async function callLLM(messages, tools, allowTools = true) {
    return groq.chat.completions.create({
        model: MODEL,
        temperature: 0,
        messages,
        ...(allowTools && { tools, tool_choice: "auto" }),
    });
}