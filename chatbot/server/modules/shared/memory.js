import { extractEntitiesLLM } from "../agent/services/entityExtractor.js";

let conversationHistory = [];
let entityMemory = [];
let summaryMemory = "";

// Add conversation turns
export function addToMemory(userMsg, assistantMsg) {
    conversationHistory.push(
        { role: "user", content: userMsg },
        { role: "assistant", content: assistantMsg }
    );

    if (conversationHistory.length > 6) {
        conversationHistory = conversationHistory.slice(-6);
    }
}

// LLM-powered entity extraction
export async function updateEntities(text) {
    const newEntities = await extractEntitiesLLM(text);

    if (newEntities.length > 0) {
        entityMemory = [
            ...new Set([
                ...entityMemory,
                ...newEntities.map(e => e.toLowerCase())
            ])
        ];
    }
}

// Get memory context
export function getMemoryContext() {

    const memoryPayload = {
        summary: summaryMemory || "",
        entities: entityMemory || []
    };

    return [
        ...(memoryPayload.summary || memoryPayload.entities.length
            ? [{
                role: "assistant",
                content: JSON.stringify(memoryPayload)
            }]
            : []),

        ...conversationHistory
    ];
}

// Summary compression
export function updateSummary() {
    if (conversationHistory.length >= 6) {
        summaryMemory = conversationHistory
            .map(m => m.content)
            .join(" ")
            .slice(0, 300);
    }
}