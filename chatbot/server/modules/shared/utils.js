export function safeParseJSON(text) {
    if (!text) {
        return {
            status: "error",
            message: "Empty response from model",
            sources: [],
        };
    }

    try {
        // Extract JSON if wrapped in text
        const match = text.match(/\{[\s\S]*\}/);
        const cleaned = match ? match[0] : text;

        const parsed = JSON.parse(cleaned);

        if (!parsed.status || !parsed.message) {
            throw new Error("Missing required fields");
        }

        return {
            status: parsed.status,
            message: parsed.message,
            sources: parsed.sources || [],
        };

    } catch {
        return {
            status: "error",
            message: "Invalid JSON from model",
            sources: [],
        };
    }
}