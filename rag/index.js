import "dotenv/config";

import readline from "readline";
import ora from "ora";

import { queryDocument } from "./services/ragPinecone.js";

const OLLAMA_CHAT_URL = "http://localhost:11434/api/chat";
const CHAT_MODEL = "llama3.2";

/* =========================================================
   READLINE INTERFACE
========================================================= */

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(prompt) {
    return new Promise((resolve) => rl.question(prompt, resolve));
}

/* =========================================================
   STEP LOGGER
========================================================= */

function step(spinner, msg) {

    if (spinner.isSpinning) {
        spinner.stopAndPersist({
            symbol: "›",
            text: spinner.text,
        });
    }

    spinner.start(msg);
}

/* =========================================================
   OLLAMA CHAT HELPER
========================================================= */

async function chatWithOllama(messages) {

    const response = await fetch(OLLAMA_CHAT_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: CHAT_MODEL,
            stream: false,
            messages,
        }),
    });

    const data = await response.json();

    if (!data.message) {
        console.error(data);
        throw new Error(data.error || "No response from Ollama");
    }

    return data.message.content.trim();
}

/* =========================================================
   QUERY CLASSIFIER
========================================================= */

async function isResearchQuery(question) {

    const result = await chatWithOllama([
        {
            role: "system",
            content: `
                Classify the input as:

                - research
                - chat

                Rules:
                - research = factual questions, technical questions,
                            document lookup, how-to
                - chat = greetings, thanks, small talk

                Reply with ONLY one word.
            `,
        },
        {
            role: "user",
            content: question,
        },
    ]);

    return result.toLowerCase().includes("research");
}

/* =========================================================
   CASUAL CHAT
========================================================= */

async function casualChat(question) {

    return await chatWithOllama([
        {
            role: "system",
            content: `
                You are a friendly AI assistant.
                Keep replies conversational and concise.
            `,
        },
        {
            role: "user",
            content: question,
        },
    ]);
}

/* =========================================================
   MAIN LOOP
========================================================= */

async function main() {

    console.clear();

    console.log("======================================");
    console.log("        LOCAL RAG ASSISTANT");
    console.log("======================================\n");

    console.log('Type "exit" or "quit" to stop.\n');

    while (true) {

        const input = await ask("You: ");
        const question = input.trim();

        if (!question) {
            console.log("\nPlease enter a valid question.\n");
            continue;
        }

        const lower = question.toLowerCase();

        if (lower === "exit" || lower === "quit") {

            console.log("\nGoodbye.\n");

            rl.close();
            process.exit(0);
        }

        const spinner = ora("Thinking...").start();

        try {

            /* =========================
               STEP 1: CLASSIFY
            ========================= */

            step(spinner, "Classifying query...");

            const research = await isResearchQuery(question);

            /* =========================
               CHAT FLOW
            ========================= */

            if (!research) {

                step(spinner, "Generating response...");

                const reply = await casualChat(question);

                spinner.succeed("Response ready");

                console.log(`\nAssistant:\n${reply}\n`);
                console.log("--------------------------------------\n");

                continue;
            }

            /* =========================
               RAG FLOW
            ========================= */

            step(spinner, "Searching documents...");

            const result = await queryDocument(question);

            if (!result.sources || result.sources.length === 0) {

                spinner.warn("No relevant context found");

                console.log(
                    "\nAssistant:\nI couldn't find relevant information in the indexed documents.\n"
                );

                console.log("--------------------------------------\n");

                continue;
            }

            spinner.succeed("Answer generated");

            console.log(`\nAssistant:\n${result.answer}\n`);

        } catch (err) {

            spinner.fail("Something went wrong");

            console.error("\nError:", err.message, "\n");
        }

        console.log("--------------------------------------\n");
    }
}

main();