import fetch from "node-fetch";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

async function getEmbedding(text) {
    const res = await fetch("http://localhost:11434/api/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "nomic-embed-text",
            prompt: text
        }),
    });

    const data = await res.json();
    return data.embedding;
}

export async function indexTheDocument(path) {
    const loader = new PDFLoader(path, { splitPages: false });
    const documents = await loader.load();

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
    });

    const chunks = await splitter.splitDocuments(documents);

    const embeddings = [];

    for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk.pageContent);

        embeddings.push({
            text: chunk.pageContent,
            embedding,
            metadata: chunk.metadata,
        });
    }

    console.log(embeddings.length, "chunks embedded");
}