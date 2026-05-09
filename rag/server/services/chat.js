const OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";
const CHAT_MODEL = "llama3.2";

/* =========================================================
   GENERATE ANSWER
========================================================= */

export async function generateAnswer(question, contextChunks) {
    const context = contextChunks
        .map((c, i) => `[Source: page ${c.page}]\n${c.text}`)
        .join("\n\n---\n\n");

    const response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: CHAT_MODEL,
            stream: false,
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant. Answer the user's question using ONLY the provided context. 
If the context doesn't contain enough information, say so clearly.
Always cite which page your answer comes from.`,
                },
                {
                    role: "user",
                    content: `Context:\n${context}\n\nQuestion: ${question}`,
                },
            ],
        }),
    });

    const data = await response.json();

    // Log the raw response to debug
    if (!data.message) {
        console.error("Ollama error response:", JSON.stringify(data, null, 2));
        throw new Error(data.error || "No message returned from Ollama");
    }

    return data.message.content;
}
