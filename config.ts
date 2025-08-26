import { ChatOllama, OllamaEmbeddings } from "@langchain/ollama";
import { config } from "dotenv";
config()

const query = ""

const llm = new ChatOllama({
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b',
    temperature: 0,
    numCtx: 40000,
})

const embeddings = new OllamaEmbeddings({
    baseUrl: 'http://localhost:11434',
    model: 'nomic-embed-text:latest'
})

export {
    llm,
    embeddings,
    query
}