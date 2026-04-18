import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

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

async function main() {

    const question = "How are you?";

    /*
      MESSAGE ROLE HIERARCHY (IMPORTANT)

      Priority (highest → lowest):

      1. system
         - Global rules, safety, personality
         - Hardest to override

      2. developer
         - App-level instructions
         - Controls formatting, structure, constraints
         - Stronger than user, weaker than system

      3. user
         - End-user input

      4. assistant
         - Previous responses (conversation memory)

      5. tool
         - Tool/function outputs (advanced use)

      Think of it like:
      system > developer > user
    */


    const response = await client.responses.create({
        temperature: 1, // sets the randomness of the output. 2 = very creative, 1 = random, 0 = deterministic
        // top_p: 0.2, // Nucleus sampling. 0.2 = only consider tokens that make up the top 20% probability mass
        // stop: "\n\n", // Stop generation when this string is encountered
        // max_output_tokens: 1000, // Maximum number of tokens to generate
        // response_format: { "type": "json_object" }, // Not supported in this API
        // max_retries: 3, // Maximum number of retries
        model: "openai/gpt-oss-20b",
        /*
          UPDATED INPUT ARRAY WITH ALL RELEVANT ROLES
        */
        input: [

            {
                role: "system",

                /*
                  SYSTEM ROLE:
                  - Defines overall personality and behavior
                  - Should be broad and high-level

                  Example uses:
                  - tone (funny, formal, strict)
                  - safety constraints
                  - general assistant identity
                */
                content: `You are a helpful AI assistant Sant. Reply in a fun, casual, slightly witty tone`
            },
            {
                role: "developer",

                /*
                  DEVELOPER ROLE:
                  - Controls HOW the assistant responds at an application level
                  - Adds constraints or formatting rules
                  - Prevents user from breaking structure

                  Example uses:
                  - "Always respond in JSON"
                  - "Keep answers under 100 words"
                  - "Use bullet points"

                  This is where you enforce consistency.
                */
                content: `
                    Always return a valid JSON object.
                    Do not include any text outside JSON.

                    Format:
                    {
                        "message": string,
                        "status": "success" | "error"
                    }
                `
            },

            {
                role: "user",

                /*
                  USER ROLE:
                  - The actual question or instruction from the user
                  - Lowest priority in terms of control

                  The model will try to answer this,
                  while respecting system + developer rules.
                */
                content: question
            },

            /*
              OPTIONAL: ASSISTANT ROLE (for conversation memory)

              Include this ONLY if continuing a conversation.

              Example:
            */

            // {
            //     role: "assistant",
            //     content: "Hey there! I'm doing great—just hanging out in the cloud. How can I help?"
            // }

            /*
              OPTIONAL: TOOL ROLE (advanced)

              Used when:
              - the model calls a function/tool
              - you return the result back to the model

              Not needed for basic usage.
            */
        ],
    });

    return response;
};

const response = await main();

const text =
    response.output_text ||
    response.output?.[0]?.content?.[0]?.text;

const data = safeParseJSON(text);

console.log(data);