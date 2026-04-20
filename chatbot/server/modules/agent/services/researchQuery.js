import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});


export async function isResearchQuery(question) {
    const response = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant",
        temperature: 0,
        max_completion_tokens: 10,
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