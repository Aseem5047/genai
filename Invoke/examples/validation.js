import OpenAI from "openai";
import Instructor from "@instructor-ai/instructor";
import { z } from "zod";

function safeParseJSON(text) {
    try {
        return JSON.parse(text);
    } catch {
        return {
            status: "error",
            message: "Model returned invalid JSON",
            raw: text,
        };
    }
}

// -----------------------------
// 1. Zod Schema (Rich + Realistic)
// -----------------------------
const UserSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    age: z.number().int().min(13).max(120),
    isSubscribed: z.boolean(),
    interests: z.array(z.string()).min(1),
    address: z.object({
        city: z.string(),
        country: z.string(),
    }),
});

// -----------------------------
// 2. OpenAI Client (Groq)
// -----------------------------
const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

// -----------------------------
// 3. Instructor Wrapper
// -----------------------------
const client = Instructor({
    client: openai,
    mode: "MD_JSON",
});

// -----------------------------
// 4. Main Function
// -----------------------------
async function extractUser() {
    const messyInput = `
    Hey, I'm Rohan. I'm 22 years old.
    You can reach me at rohan.dev@gmail.com.
    I live in Delhi, India.
    I'm really into coding, startups, and football.
    Yeah, I’m subscribed to your newsletter.
  `;

    try {
        const result = await client.responses.create({
            model: "openai/gpt-oss-20b",
            temperature: 0,
            // response_model: UserSchema, // as in our model's case response_model is not supported thus we have to manually add prompt enforcement
            input: [
                {
                    role: "system",
                    content: `
                    You extract structured user data from text.
                    Be precise and do not hallucinate missing fields.

                    Extract structured JSON.

                    Rules:
                    - Return ONLY valid JSON
                    - No explanation
                    - Match this schema exactly:

                    {
                    "name": string,
                    "email": string,
                    "age": number,
                    "isSubscribed": boolean,
                    "interests": string[],
                    "address": {
                        "city": string,
                        "country": string
                    }
                    }
                            `,
                },
                {
                    role: "user",
                    content: messyInput,
                },
            ],
        });

        return result;
    } catch (error) {
        console.error("Extraction failed:", error);
        throw error;
    }
}

// -----------------------------
// 5. Run
// -----------------------------

async function extractWithRetry(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await extractUser();

            const text =
                response.output_text ||
                response.output?.[0]?.content?.[0]?.text ||
                "";

            const parsed = safeParseJSON(text);

            const validated = UserSchema.parse(parsed);

            console.log(validated)

            return validated;

        } catch (err) {
            console.warn(`Attempt ${attempt} failed`);

            if (attempt === retries) {
                throw new Error("Max retries reached");
            }
        }
    }
}

extractWithRetry();