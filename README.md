# Deep Research Pipeline

![Pipeline Graph](https://github.com/ItzCrazyKns/Deep-Research/blob/main/assets/graph.png)

## Overview

This project implements a modular, multi-stage deep research pipeline using TypeScript and LangChain. The system is designed to take a user query and autonomously:

1. Route the query for clarification or research.
2. Extract a precise research topic.
3. Supervise and decompose the research into sub-topics.
4. Generate targeted web search queries.
5. Filter and summarize web results.
6. Synthesize a comprehensive, well-cited answer.

---

## Main Components

- **Router**: Determines if the user query is ready for research or needs clarification.
- **User Question Handler**: Asks clarifying questions if needed.
- **Topic Extractor**: Converts conversation into a standalone research topic.
- **Research Supervisor**: Decomposes the main topic, tracks confidence, and orchestrates sub-research.
- **Topic Research Supervisor**: Generates web search queries for each research gap.
- **Web Search & Filter**: Executes searches and selects the most relevant results.
- **Summarizer**: Produces concise, data-rich summaries from web content.
- **Answer Generator**: Synthesizes a final, well-structured, and cited answer.

---


## File Structure

- `deep_researcher.ts` — Main pipeline logic and orchestration.
- `prompts.ts` — All prompt templates and few-shot examples for each node.
- `utils.ts` — Utility functions for parsing, formatting, and web scraping.
- `config.ts` — LLM and embedding model configuration, and the main research query.
- `package.json` — Dependencies and scripts.
- `tsconfig.json` — TypeScript configuration.
- `assets/graph.png` — Visual graph of the pipeline.
- `answer.txt` — The final answer is saved here after each run.

---

## Configuration & Customization

- **Change LLM and Embedding Providers:**
  - You can fully customize which LLM (large language model) or LLM provider, and which embedding model or embedding provider to use in `config.ts`.
  - Update the model names, providers, or endpoints as needed for your environment.
- **Change the Research Query:**
  - You can set what the pipeline will perform deep research for by editing the initial query in `config.ts` (see the `main` function in `deep_researcher.ts` for usage).
- **Edit Prompts:**
  - Edit `prompts.ts` to refine the behavior and instructions for each pipeline node.

---

## Setup & Running

1. **Install dependencies**  
	```powershell
	yarn
	```

2. **Build the project**  
	```powershell
	yarn build
	```

3. **Start the pipeline**  
	```powershell
	yarn start
	```
	- The answer to your research query will be saved in `answer.txt`.

4. **Development mode**  
	```powershell
	yarn dev
	```

---

## Output

- The final answer is always written to `answer.txt` in the project root.
- The answer is well-structured, cited, and suitable for professional use.

---

## Requirements

- Node.js
- Yarn

---
