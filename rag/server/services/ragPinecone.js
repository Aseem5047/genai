import fetch from "node-fetch";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Pinecone } from "@pinecone-database/pinecone";
import crypto from "crypto";

const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.Index({ name: "pdf-docs" });

const BATCH_SIZE = 100; // control this

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

export async function queryDocument(question) {
    const queryEmbedding = await getEmbedding(question);

    const results = await index.query({
        vector: queryEmbedding,
        topK: 3,
        includeMetadata: true,
    });

    const matches = results.matches.map(match => match.metadata.text);

    console.log(matches);
}

export async function indexTheDocument(path) {
    // 1. Load PDF
    const loader = new PDFLoader(path, { splitPages: false });
    const documents = await loader.load();

    // 2. Split into chunks
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
    });

    const chunks = await splitter.splitDocuments(documents);

    // 3. Generate embeddings (still sequential here)
    const vectors = [];

    for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk.pageContent);

        vectors.push({
            id: crypto.randomUUID(),
            values: embedding,
            metadata: {
                text: chunk.pageContent,
                ...chunk.metadata,
            },
        });
    }

    // 4. Proper batching for Pinecone
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
        const batch = vectors.slice(i, i + BATCH_SIZE);

        await index.upsert(batch);

        console.log(`Uploaded batch ${i / BATCH_SIZE + 1}`);
    }

    console.log("Stored", vectors.length, "chunks in Pinecone");
}