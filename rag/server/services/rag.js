import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

export async function indexTheDocument(path) {
    const loader = new PDFLoader(path)
    const docs = await loader.load()
    console.log(docs)
}

