import "dotenv/config";
import { indexTheDocument, queryDocument } from "./services/ragPinecone.js";

const path = "./documents/SystemDesignInterview.pdf"
await indexTheDocument(path);

const results = await queryDocument(
    "What is this document about?",
    {
        topK: 3,
    }
);

console.log(results);   