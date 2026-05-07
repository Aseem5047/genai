import fetch from "node-fetch";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient } from "chromadb";
import crypto from "crypto";

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

// utilizing chroma as vector db

export async function queryDocument(question) {
    const client = new ChromaClient();
    const collection = await client.getOrCreateCollection({
        name: "pdf-docs",
    });

    // Convert query to embedding
    const queryEmbedding = await getEmbedding(question);

    // Search similar chunks
    const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 3,
    });

    console.log(results.documents);
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

    // 3. Init Chroma
    const client = new ChromaClient();
    const collection = await client.getOrCreateCollection({
        name: "pdf-docs",
    });

    // 4. Process chunks
    for (const chunk of chunks) {
        const embedding = await getEmbedding(chunk.pageContent);

        await collection.add({
            ids: [crypto.randomUUID()],
            embeddings: [embedding],
            documents: [chunk.pageContent],
            metadatas: [chunk.metadata],
        });
    }

    console.log("Stored", chunks.length, "chunks in Chroma");
}