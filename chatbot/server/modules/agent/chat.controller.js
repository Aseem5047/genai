import { runAgent } from "../shared/runAgent.js";
import { isResearchQuery } from "./services/researchQuery.js";

const useChatController = async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                error: "Message is required",
            });
        }

        let result;

        if (!await isResearchQuery(message)) {
            result = {
                status: "success",
                message: "Hey there! Ask me anything — I can search the web and answer questions.",
                sources: []
            }
        } else {
            result = await runAgent(message);
        }

        const payload = {
            reply: result.message,
            status: result.status,
            sources: result.sources || [],
            steps_taken: result.steps_taken || 0,
        }

        res.status(200).json(payload);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            status: "error",
            message: "Internal server error",
        });
    }
}

export { useChatController };