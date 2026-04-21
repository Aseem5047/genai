import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function extractEntitiesLLM(text) {
    try {
        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            temperature: 0,
            max_completion_tokens: 100,
            messages: [
                {
                    role: "system",
                    content: `
                        Extract important entities from the user input.

                        Return ONLY a JSON array of strings.

                        Include:
                        - Products
                        - Companies
                        - People
                        - Technologies
                        - Topics

                        Example:
                        Input: "Compare iPhone 15 and Tesla Model 3"
                        Output: ["iPhone 15", "Tesla Model 3"]

                        Rules:
                        - No explanation
                        - No extra text
                        - Only JSON array
                    `
                },
                {
                    role: "user",
                    content: text
                }
            ]
        });

        const raw = response.choices[0].message.content.trim();

        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {
            return parsed;
        }

        return [];

    } catch {
        return [];
    }
}