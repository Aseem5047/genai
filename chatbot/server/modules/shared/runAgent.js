import { callLLMWithRetry } from "./llm.js";
import { tools, toolHandlers } from "./tools.js";
import { safeParseJSON } from "./utils.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import {
    getMemoryContext,
    addToMemory,
    updateEntities,
    updateSummary
} from "./memory.js";
import { isResearchQuery } from "../agent/services/researchQuery.js";

export async function runAgent(question) {
    if (await isResearchQuery(question)) {
        await updateEntities(question);
    }
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...getMemoryContext(),
        {
            role: "user",
            content: `
                Answer the following:

                ${question}

                Follow structured format using TITLE, SECTION, POINT.
            `
        },
    ];

    let steps = 0;
    const MAX_STEPS = 6;
    const MAX_SEARCHES = 2;

    let searchCount = 0;
    let justCalledTools = false;
    let forceNoTools = false;
    let previousQueries = [];
    let formatRetryCount = 0;
    const MAX_FORMAT_RETRIES = 2;

    while (steps < MAX_STEPS) {
        steps++;

        let response;

        try {
            const allowTools =
                !justCalledTools &&
                !forceNoTools &&
                searchCount < MAX_SEARCHES;

            response = await callLLMWithRetry(messages, tools, allowTools, 3);

        } catch (err) {
            messages.push({
                role: "user",
                content: "System error occurred. Continue without tools.",
            });

            forceNoTools = true;
            continue;
        }

        const msg = response.choices[0].message;
        messages.push(msg);
        justCalledTools = false;

        // ========================
        // FINAL ANSWER HANDLING
        // ========================
        if (!msg.tool_calls || msg.tool_calls.length === 0) {

            if (!msg.content) continue;

            const parsed = safeParseJSON(msg.content);

            // INVALID FORMAT
            if (!parsed || !parsed.status || !parsed.message) {
                formatRetryCount++;

                if (formatRetryCount >= MAX_FORMAT_RETRIES) {
                    return {
                        status: "error",
                        message: "Failed to produce valid structured response",
                        sources: [],
                        steps_taken: steps,
                    };
                }

                messages.push({
                    role: "user",
                    content: `
                        Return ONLY valid JSON:

                        {
                        "status": "success",
                        "message": "your answer",
                        "sources": []
                        }

                        No text before or after.
                    `
                });

                forceNoTools = true;
                continue;
            }

            // SUCCESS
            if (parsed.status === "success") {
                addToMemory(question, parsed.message);
                if (await isResearchQuery(question)) {
                    await updateEntities(question);
                }
                updateSummary();
                return { ...parsed, steps_taken: steps };
            }

            // WEAK → TRY AGAIN OR FALLBACK
            if (parsed.status === "weak") {

                if (searchCount >= MAX_SEARCHES) {
                    // 🔥 FORCE INFERENCE MODE
                    messages.push({
                        role: "user",
                        content: `
                            Search limit reached.

                            You MUST now:
                            - Use available data
                            - Include leaks, trends, and expected specs
                            - Provide best possible comparison

                            Return ONLY JSON.
                        `
                    });

                    forceNoTools = true;
                    continue;
                }

                messages.push({
                    role: "user",
                    content: `
                        Results were weak.

                        Reformulate query using:
                        - "[product] specs"
                        - "[product] features"
                        - "[product] leaks"

                        Do NOT repeat queries.
                    `
                });

                continue;
            }

            // UNCERTAIN → REFINE ONCE
            if (parsed.status === "uncertain") {

                if (searchCount >= MAX_SEARCHES) {
                    addToMemory(question, parsed.message);
                    updateSummary();
                    return { ...parsed, steps_taken: steps };
                }

                messages.push({
                    role: "user",
                    content: `
                        Refine your answer using available data.

                        If needed, include expected or rumored information.
                    `
                });

                continue;
            }

            // ERROR
            if (parsed.status === "error") {

                if (steps >= MAX_STEPS - 1) {
                    return { ...parsed, steps_taken: steps };
                }

                messages.push({
                    role: "user",
                    content: `
                        Try a different approach.

                        Return ONLY valid JSON.
                    `
                });

                continue;
            }

            // FALLBACK
            forceNoTools = true;

            messages.push({
                role: "user",
                content: `
                    Return final JSON now.

                    {
                    "status": "success" | "uncertain" | "error",
                    "message": "string",
                    "sources": []
                    }
                `
            });
        }

        // ========================
        // TOOL CALL HANDLING
        // ========================
        for (const toolCall of msg.tool_calls) {

            const { name, arguments: argsStr } = toolCall.function;

            let args;

            try {
                args = JSON.parse(argsStr);
            } catch (err) {
                messages.push({
                    role: "user",
                    content: `
                    Invalid tool arguments JSON.

                    Fix and retry:
                    ${argsStr}
                    `
                });

                justCalledTools = true;
                continue;
            }

            if (args?.query) {
                previousQueries.push({
                    query: args.query,
                    step: steps
                });

                // keep only last 3
                previousQueries = previousQueries.slice(-3);
            }

            if (name === "web_search") {
                searchCount++;
            }

            const result = await toolHandlers[name](args);

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
            });
        }

        // ========================
        // POST-TOOL GUIDANCE
        // ========================
        messages.push({
            role: "user",
            content: searchCount < MAX_SEARCHES
                ? `
                    Evaluate results.

                    If weak:
                    - search again (new query)

                    If sufficient:
                    - return final JSON

                    Previous queries:
                    ${previousQueries.map(q => q.query).join("\n")} 
                    `
                : `
                    Search limit reached.

                    Return best possible answer using:
                    - available data
                    - inferred expectations

                    Return ONLY JSON.
                `
        });

        if (searchCount >= MAX_SEARCHES) {
            forceNoTools = true;
        }

        justCalledTools = true;
    }

    return {
        status: "error",
        message: "Max steps exceeded",
        sources: [],
        steps_taken: steps,
    };
}