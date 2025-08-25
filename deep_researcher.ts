import { ChatOllama } from "@langchain/ollama";
import { Annotation, Command, START, StateGraph, StateType, UpdateType } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { Document } from "@langchain/core/documents";
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { answerPrompt, researchRouterFewShots, researchRouterPrompt, researchSuperviserFewShots, researchSuperviserPrompt, searchResultFilterFewShots, searchResultFilterPrompt, summarizerPrompt, topicExractorPrompt, topicExtractorFewShots, topicResearchSuperviserFewShots, topicResearchSuperviserPrompt, userQuestionFewShots, userQuestionPrompt } from "./prompts";
import { cosineSimilarity, formatChatHistoryAsString, formatContextAsString, getArticleLengthScore, searchWeb, XMLOutputParser } from './utils';
import axios from 'axios'
import { config } from "dotenv";
import { ChatOpenAI, OpenAI, OpenAIEmbeddings } from "@langchain/openai";
import fs from 'fs';
import Exa from "exa-js";
import { RunnableLambda } from "@langchain/core/runnables";
config()

const exa = new Exa(process.env.EXA_API_KEY);

const llm = new ChatOllama({
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:8b',
    temperature: 0,
    numCtx: 32386,
})

const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-large'
})
/* 
const llm = new ChatOpenAI({
    model: 'gpt-4.1-mini',
    temperature: 0
})
 */
const InputStateAnnotation = Annotation.Root({
    chat_history: Annotation<BaseMessage[]>,
    follow_up: Annotation<string>
})

const GraphStateAnnotation = Annotation.Root({
    chat_history: Annotation<BaseMessage[]>,
    follow_up: Annotation<string>,
    current_context: Annotation<Document[]>({
        reducer: (state, update) => state.concat(update),
        default: () => []
    }),
    route_to: Annotation<string>,
    research_topic: Annotation<string>,
    current_sub_research_topic: Annotation<string>,
    current_sub_research_context: Annotation<Document[]>,
    current_sub_research_confidence: Annotation<number>,
    current_sub_research_query: Annotation<string>,
    current_sub_research_web_search_results: Annotation<Document[]>,
    current_sub_research_urls: Annotation<string[]>,
    confidence: Annotation<number>,
    num_topics_searched: Annotation<number>({
        reducer: (state, update) => state + 1,
        default: () => 0
    }),
    num_web_searches: Annotation<number>
})

const OutputStateAnnotation = Annotation.Root({
    answer: Annotation<string>({
        reducer: (state, update) => state + update
    }),
    route_to: Annotation<string>,
})

const researchRouterNode = async (input: typeof InputStateAnnotation.State) => {
    const formattedHistory = formatChatHistoryAsString(input.chat_history ?? [])

    const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', researchRouterPrompt],
        ...researchRouterFewShots,
        ['user', `
        <conversation>
        ${formattedHistory}
        </conversation>
        
        <follow_up>
        ${input.follow_up}
        </follow_up>
        `]
    ])

    const formattedPrompt = await promptTemplate.format({})

    const out = await llm.invoke(formattedPrompt)

    return new Command({
        update: {
            route_to: XMLOutputParser('route', out.content as string)
        }
    })
}

const researchRouterEdge = (input: typeof GraphStateAnnotation.State) => {
    return input.route_to === 'question' ? 'userQuestionNode' : 'researchTopicExtractionNode'
}

const userQuestionNode = async (input: typeof GraphStateAnnotation.State) => {
    const formattedHistory = formatChatHistoryAsString(input.chat_history ?? [])

    const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', userQuestionPrompt],
        ...userQuestionFewShots,
        ['user', `
            <conversation>
            ${formattedHistory}
            </conversation>

            <follow_up>
            ${input.follow_up}
            </follow_up>
        `]
    ])

    const formattedPrompt = await promptTemplate.format({})

    const out = await llm.invoke(formattedPrompt)

    return new Command({
        update: {
            answer: out.content
        }
    })
}

const researchTopicExtractionNode = async (input: typeof InputStateAnnotation.State) => {
    const formattedHistory = formatChatHistoryAsString(input.chat_history ?? [])

    const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', topicExractorPrompt],
        ...topicExtractorFewShots,
        ['user', `
        <conversation>
        ${formattedHistory}
        </conversation>    

        <follow_up>
        ${input.follow_up}
        </follow_up>
        `]
    ])

    const formattedPrompt = await promptTemplate.format({})

    const out = await llm.invoke(formattedPrompt)

    return new Command({
        update: {
            research_topic: XMLOutputParser('topic', out.content as string)
        },
    })
}

const researchSuperviserNode = async (input: typeof GraphStateAnnotation.State) => {
    const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', researchSuperviserPrompt],
        ...researchSuperviserFewShots,
        ['human', `
        <main_research_topic>
        ${input.research_topic}
        </main_research_topic>

        <current_context>
        ${formatContextAsString(input.current_context ?? [])}
        </current_context>

        <current_confidence>
        ${input.confidence}
        </current_confidence>
        `]
    ])

    const formattedPrompt = await promptTemplate.format({})

    const out = await llm.invoke(formattedPrompt)

    const confidence = parseFloat(XMLOutputParser('confidence', out.content as string))
    const researchTopic = XMLOutputParser('research_topic', out.content as string)
    console.log(out.content)
    return new Command({
        update: {
            confidence,
            current_sub_research_topic: researchTopic,
            current_sub_research_context: [], // Empty the context before new search
            current_sub_research_web_search_results: [],
            num_topics_searched: 1,
            num_web_searches: 0
        }
    })
}

const researchSuperviserRouter = (input: typeof GraphStateAnnotation.State) => {
    return (input.confidence >= 0.9 || input.num_topics_searched >= 10) ? 'answerGenerationNode' : 'topicResearchSuperviserNode'
}

const topicResearchSuperviserNode = async (input: typeof GraphStateAnnotation.State) => {
    const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', topicResearchSuperviserPrompt],
        ...topicResearchSuperviserFewShots,
        ['user', `
        <research_topic>
        ${input.current_sub_research_topic}
        </research_topic>

        <current_context>
        ${formatContextAsString(input.current_sub_research_context ?? [])}
        </current_context>

        <current_confidence>
        ${input.current_sub_research_confidence}
        </current_confidence>
        `]
    ])

    const formattedPrompt = await promptTemplate.format({})

    const out = await llm.invoke(formattedPrompt)

    const query = XMLOutputParser('query', out.content as string)
    const confidence = parseFloat(XMLOutputParser('confidence', out.content as string))

    return new Command({
        update: {
            current_sub_research_query: query,
            current_sub_research_confidence: confidence
        }
    })
}

const topicResearchSuperviserRouter = async (input: typeof GraphStateAnnotation.State) => {
    return (input.current_sub_research_confidence >= 0.8 || input.num_web_searches >= 5) ? 'contextFilterNode' : 'webSearchNode'
}

const webSearchNode = async (input: typeof GraphStateAnnotation.State) => {
    const docs = await searchWeb(input.current_sub_research_query ?? '')

    return new Command({
        update: {
            current_sub_research_web_search_results: docs,
            num_web_searches: input.num_web_searches + 1
        }
    })
}

const webSearchFilterNode = async (input: typeof GraphStateAnnotation.State) => {
    const existingUrls = new Set(input.current_sub_research_context.map(doc => doc.metadata.source))
    const filteredResults = input.current_sub_research_web_search_results.filter(doc => !existingUrls.has(doc.metadata.source))

    const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', searchResultFilterPrompt],
        ...searchResultFilterFewShots,
        ['user', `
        <research_topic>
        ${input.research_topic}
        </research_topic>

        <search_results>
        ${formatContextAsString(filteredResults ?? [])}
        </search_results>
        `]
    ])

    const formattedPrompt = await promptTemplate.format({})

    const out = await llm.invoke(formattedPrompt)

    const selected_urls = XMLOutputParser('selected_urls', out.content as string)

    return new Command({
        update: {
            current_sub_research_urls: selected_urls.split('\n')
        }
    })
}

const summarizerNode = async (input: typeof GraphStateAnnotation.State) => {
    let newContext: Document[] = []

    await Promise.all(input.current_sub_research_urls?.map(async (url) => {
        try {
            const result = await exa.getContents(
                [url],
                {
                    text: true
                }
            )

            const promptTemplate = ChatPromptTemplate.fromMessages([
                ['system', summarizerPrompt],
                ['user', `
            <query>
            {research_query}
            </query>

            <page_content>
            {page_content}
            </page_content>
            `]
            ])

            const formattedPrompt = await promptTemplate.format({
                research_query: input.current_sub_research_query,
                page_content: result.results[0].text
            })

            const out = await llm.invoke(formattedPrompt)

            const document = new Document({
                pageContent: out.content as string,
                metadata: {
                    source: url,
                    title: result.results[0].title ?? 'No title'
                }
            })

            newContext.push(document)
        } catch (err: Error | any) {
            console.log(`An error ocurred while summarizing: ${err.message}`)
        }
    }))

    return new Command({
        update: {
            current_sub_research_context: [...input.current_sub_research_context.filter(doc => doc.pageContent), ...newContext],
            current_sub_research_action: '',
            current_sub_research_query: '',
            current_sub_research_urls: [],
            current_sub_research_web_search_results: [],
        }
    })
}

const answerGenerationNode = async (input: typeof GraphStateAnnotation.State) => {
    const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', answerPrompt],
        ['human', `
        <main_research_topic>
        ${input.research_topic}
        </main_research_topic>

        <context>
        ${formatContextAsString(input.current_context)}
        </context>
        `]
    ])

    const formattedPrompt = await promptTemplate.format({})

    const out = await llm.invoke(formattedPrompt)

    return new Command({
        update: {
            answer: out.content as string
        }
    })
}

const contextFilterNode = async (input: typeof GraphStateAnnotation.State) => {
    const queryEmbedding = await embeddings.embedQuery(input.current_sub_research_topic ?? '')

    const documentEmbeddings = await embeddings.embedDocuments(input.current_sub_research_context.map(doc => doc.pageContent))

    const similarities = documentEmbeddings.map((docEmb, i) => {
        return {
            doc: input.current_sub_research_context[i],
            similarity: cosineSimilarity(queryEmbedding, docEmb)
        }
    })

    const maxContextThreshold = getArticleLengthScore(input.current_sub_research_context.reduce((a, b) => a + b.pageContent.length, 0) / (input.current_sub_research_context.length || 1))
    console.log(`Adding ${maxContextThreshold} documents to context`)
    return new Command({
        update: {
            current_context: similarities.sort((a, b) => b.similarity - a.similarity).map(item => item.doc).slice(0, maxContextThreshold),
        }
    })
}

const graph = new StateGraph<
    (typeof GraphStateAnnotation)["spec"],
    StateType<(typeof GraphStateAnnotation)["spec"]>,
    UpdateType<(typeof OutputStateAnnotation)["spec"]>,
    typeof START,
    (typeof InputStateAnnotation)["spec"],
    (typeof OutputStateAnnotation)["spec"]
>({
    input: InputStateAnnotation,
    output: OutputStateAnnotation,
    stateSchema: GraphStateAnnotation,
})
    .addNode('researchRouterNode', RunnableLambda.from(researchRouterNode).withConfig({
        tags: ['nostream']
    }))
    .addNode('userQuestionNode', userQuestionNode)
    .addNode('researchTopicExtractionNode', RunnableLambda.from(researchTopicExtractionNode).withConfig({
        tags: ['nostream']
    }))
    .addNode('researchSuperviserNode', RunnableLambda.from(researchSuperviserNode).withConfig({
        tags: ['nostream']
    }))
    .addNode('answerGenerationNode', answerGenerationNode)
    .addNode('topicResearchSuperviserNode', RunnableLambda.from(topicResearchSuperviserNode).withConfig({
        tags: ['nostream']
    }))
    .addNode('webSearchNode', RunnableLambda.from(webSearchNode).withConfig({
        tags: ['nostream']
    }))
    .addNode('summarizerNode', RunnableLambda.from(summarizerNode).withConfig({
        tags: ['nostream']
    }))
    .addNode('webSearchFilterNode', RunnableLambda.from(webSearchFilterNode).withConfig({
        tags: ['nostream']
    }))
    .addNode('contextFilterNode', RunnableLambda.from(contextFilterNode).withConfig({
        tags: ['nostream']
    }))

    .addEdge('__start__', 'researchRouterNode')

    .addConditionalEdges('researchRouterNode', researchRouterEdge, [
        "userQuestionNode",
        "researchTopicExtractionNode",
    ])

    .addEdge('userQuestionNode', '__end__')

    .addEdge('researchTopicExtractionNode', 'researchSuperviserNode')

    .addConditionalEdges('researchSuperviserNode', researchSuperviserRouter, [
        'answerGenerationNode',
        'topicResearchSuperviserNode'
    ])

    .addEdge('answerGenerationNode', '__end__')

    .addConditionalEdges('topicResearchSuperviserNode', topicResearchSuperviserRouter, [
        'webSearchNode',
        'contextFilterNode'
    ])

    .addEdge('webSearchNode', 'webSearchFilterNode')
    .addEdge('webSearchFilterNode', 'summarizerNode')
    .addEdge('summarizerNode', 'topicResearchSuperviserNode')
    .addEdge('contextFilterNode', 'researchSuperviserNode')

const app = graph.compile()

const main = async () => {
    const res = await app.stream({
        chat_history: [],
        follow_up: 'Perform deep research on the new gpt-oss LLM released by OpenAI, i am interested in performance, accuracy, architecture and use cases.'
    }, {
        streamMode: ['values', 'messages'],
        recursionLimit: 10000
    })

    for await (const [type, chunk] of res) {
        if (type === 'values') {
            console.log(chunk)
        }
        if (type === 'values'&& chunk.answer) {
            fs.writeFileSync('answer.txt', chunk.answer)
        } else if (type === 'messages') {
            console.log(chunk[0].content)
        }
    }

    /* const graph = (await app.getGraphAsync()).drawMermaidPng({
        curveStyle: 'basis'
    })

    fs.writeFileSync('graph.png', new Uint8Array(await (await graph).arrayBuffer())) */
}

main()