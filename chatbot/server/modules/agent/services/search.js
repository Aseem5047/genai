import { tavily } from "@tavily/core";

const tavily_client = tavily({
    apiKey: process.env.TAVILY_API_KEY,
});

// ------------------------
// WEAK RESULT DETECTOR
// ------------------------
function isWeakResult(results) {
    if (!results || results.length < 2) return true;

    const weak = results.filter(
        (r) => !r.content || r.content.length < 100
    );

    return weak.length > results.length * 0.6;
}

// ------------------------
// FORMAT RESULTS
// ------------------------
function formatResults(data) {
    return {
        status: isWeakResult(data.results) ? "weak" : "success",
        answer: data.answer || "",
        results:
            data.results?.slice(0, 5).map((r) => ({
                title: r.title,
                url: r.url,
                summary: r.content?.slice(0, 500),
            })) || [],
    };
}

// ------------------------
// PRIMARY SEARCH
// ------------------------
async function primarySearch(query) {
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

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return formatResults(data);
}

// ------------------------
// FALLBACK SEARCH
// ------------------------
async function fallbackSearch(query) {
    const data = await tavily_client.search({
        query,
        search_depth: "advanced",
    });

    return {
        ...formatResults(data),
        fallback: true,
    };
}

// ------------------------
// MAIN EXPORT
// ------------------------
export async function searchWeb(query) {
    try {
        return await primarySearch(query);
    } catch (err) {
        try {
            return await fallbackSearch(query);
        } catch (fallbackErr) {
            return {
                status: "error",
                message: "Search failed",
                details: {
                    primary: err.message,
                    fallback: fallbackErr.message,
                },
            };
        }
    }
}