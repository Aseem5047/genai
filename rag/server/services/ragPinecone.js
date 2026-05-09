import crypto from "crypto";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { Pinecone } from "@pinecone-database/pinecone";
import { generateAnswer } from "./chat";

/* =========================================================
   CONFIG
========================================================= */

const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

const indexName = process.env.PINECONE_INDEX_NAME;
const namespace = process.env.PINECONE_NAMESPACE || "default";

const EMBEDDING_MODEL = "nomic-embed-text";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

const UPSERT_BATCH_SIZE = 100;
const EMBEDDING_CONCURRENCY = 2;

const OLLAMA_URL = "http://localhost:11434/api/embed";


/* =========================================================
   INITIALIZE INDEX
========================================================= */

async function ensureIndexExists() {
    const indexes = await pinecone.listIndexes();

    const exists = indexes.indexes?.some(
        (idx) => idx.name === indexName
    );

    if (!exists) {
        console.log("Creating Pinecone index...");

        // verify embedding dimension dynamically
        const sampleEmbedding = await getEmbedding("dimension check");

        await pinecone.createIndex({
            name: indexName,
            dimension: sampleEmbedding.length,
            metric: "cosine",
            spec: {
                serverless: {
                    cloud: "aws",
                    region: "us-east-1",
                },
            },
        });

        console.log(
            `Created index "${indexName}" with dimension ${sampleEmbedding.length}`
        );
    }

    return pinecone.index(indexName);
}

const index = await ensureIndexExists();

/* =========================================================
   EMBEDDINGS
========================================================= */

async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getEmbedding(text, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(OLLAMA_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: EMBEDDING_MODEL,
                    input: text,
                }),
            });

            if (!response.ok) {
                throw new Error(
                    `Embedding request failed: ${response.status}`
                );
            }

            const data = await response.json();

            if (!data.embeddings || !data.embeddings[0]) {
                throw new Error("No embedding returned");
            }

            return data.embeddings[0];
        } catch (error) {
            console.error(
                `Embedding attempt ${attempt} failed:`,
                error.message
            );

            if (attempt === retries) {
                throw error;
            }

            await sleep(1000 * attempt);
        }
    }
}

/* =========================================================
   HELPERS
========================================================= */

function createDeterministicId(text) {
    return crypto
        .createHash("sha256")
        .update(text)
        .digest("hex");
}

async function processEmbeddingBatch(batchChunks, sourcePath) {
    const embedded = await Promise.all(
        batchChunks.map(async (chunk, index) => {
            const embedding = await getEmbedding(chunk.pageContent);

            const id = createDeterministicId(
                `${sourcePath}-${chunk.pageContent}`
            );

            return {
                id,
                values: embedding,
                metadata: {
                    text: chunk.pageContent.slice(0, 2000),

                    source: sourcePath,

                    page:
                        chunk.metadata?.loc?.pageNumber ||
                        chunk.metadata?.page ||
                        null,

                    chunk: index,
                },
            };
        })
    );

    return embedded;
}

/* =========================================================
   INDEX DOCUMENT
========================================================= */

export async function indexTheDocument(path) {
    console.log(`Loading PDF: ${path}`);

    /* -----------------------------
       1. LOAD PDF
    ------------------------------ */

    const loader = new PDFLoader(path, {
        splitPages: true,
    });

    const documents = await loader.load();

    console.log(`Loaded ${documents.length} pages`);

    /* -----------------------------
       2. SPLIT INTO CHUNKS
    ------------------------------ */

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP,
    });

    const chunks = await splitter.splitDocuments(documents);

    console.log(`Created ${chunks.length} chunks`);

    /* -----------------------------
       3. GENERATE EMBEDDINGS
    ------------------------------ */

    const vectors = [];

    for (
        let i = 0;
        i < chunks.length;
        i += EMBEDDING_CONCURRENCY
    ) {
        const batch = chunks.slice(
            i,
            i + EMBEDDING_CONCURRENCY
        );

        console.log(
            `Embedding batch ${Math.floor(i / EMBEDDING_CONCURRENCY) + 1}`
        );

        const embeddedBatch = await processEmbeddingBatch(
            batch,
            path
        );

        vectors.push(...embeddedBatch);
    }

    console.log(`Generated ${vectors.length} embeddings`);

    /* -----------------------------
       4. UPSERT TO PINECONE
    ------------------------------ */

    const pineconeNamespace = index.namespace(namespace);

    for (
        let i = 0;
        i < vectors.length;
        i += UPSERT_BATCH_SIZE
    ) {
        const batch = vectors.slice(
            i,
            i + UPSERT_BATCH_SIZE
        );

        if (!batch.length) continue;

        await pineconeNamespace.upsert({ records: batch });

        console.log(
            `Uploaded batch ${Math.floor(i / UPSERT_BATCH_SIZE) + 1
            }`
        );
    }

    console.log(
        `Stored ${vectors.length} chunks in Pinecone`
    );

    return {
        success: true,
        chunks: vectors.length,
    };
}



/* =========================================================
   QUERY DOCUMENT
========================================================= */

export async function queryDocument(
    question,
    options = {}
) {
    const {
        topK = 5,
        sourceFilter = null,
    } = options;

    console.log(`Query: ${question}`);

    /* -----------------------------
       1. EMBED QUERY
    ------------------------------ */

    const queryEmbedding = await getEmbedding(question);

    /* -----------------------------
       2. BUILD FILTER
    ------------------------------ */

    let filter = undefined;

    if (sourceFilter) {
        filter = {
            source: sourceFilter,
        };
    }

    /* -----------------------------
       3. QUERY PINECONE
    ------------------------------ */

    const pineconeNamespace = index.namespace(namespace);

    const results = await pineconeNamespace.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        filter,
    });

    /* -----------------------------
       4. FORMAT RESULTS
    ------------------------------ */

    const matches = results.matches.map((match) => ({
        score: match.score,
        text: match.metadata?.text,
        source: match.metadata?.source,
        page: match.metadata?.page,
        chunk: match.metadata?.chunk,
    }));

    // ✅ Filter low-confidence chunks before sending to LLM
    const relevantMatches = matches.filter(m => m.score > 0.5);

    // ✅ Generate answer from retrieved context
    const answer = await generateAnswer(question, relevantMatches);

    return { answer, sources: relevantMatches };
}

/* =========================================================
   DELETE DOCUMENT
========================================================= */

export async function deleteDocument(path) {
    console.log(`Deleting vectors for: ${path}`);

    const pineconeNamespace = index.namespace(namespace);

    await pineconeNamespace.deleteMany({
        source: path,
    });

    console.log("Document deleted");
}

