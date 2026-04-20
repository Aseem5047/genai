import { searchWeb } from "../agent/services/search.js";

export const toolHandlers = {
    web_search: async ({ query }) => {
        return await searchWeb(query);
    },
};

export const tools = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web for up-to-date information",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string" },
                },
                required: ["query"],
            },
        },
    },
];