import { Document } from "@langchain/core/documents";
import { BaseMessage, isAIMessage } from "@langchain/core/messages";

export const XMLOutputParser = (key: string, input: string) => {
    const startTag = `<${key}>`;
    const endTag = `</${key}>`;

    const startIndex = input.indexOf(startTag);
    const endIndex = input.indexOf(endTag);

    if (startIndex === -1 || endIndex === -1) {
        console.log(input)
        throw new Error(`Key <${key}> not found`);
    }

    return input.slice(startIndex + startTag.length, endIndex).trim()
};

export const formatChatHistoryAsString = (history: BaseMessage[]) => {
    return history.map((m) => isAIMessage(m) ? `AI: ${m.content}` : `User: ${m.content}`).join('\n')
}

export const formatContextAsString = (context: Document[]) => {
    return context.map((doc, i) => `${i + 1}. ${doc.metadata.source} : ${doc.pageContent.replace(/{/g, '(').replace(/}/g, ')')} - ${doc.metadata.title}`).join('\n\n')
}

export const searchWeb = async (query: string): Promise<Document[]> => {
    const res = await fetch(`http://localhost:4000/search?q=${query}&format=json`)
    const results = (await res.json()).results
    
    return results.map((result: any) => new Document({
        pageContent: result.content,
        metadata: {
            source: result.url,
            title: result.title
        }
    }))
}

export const cosineSimilarity = (a: number[], b: number[]) => {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

export const getArticleLengthScore = (averageLength: number): number => {
  const referenceLength = 2000;
  const referenceScore = 5;
  
  const decayFactor = 0.002;
  
  const rawScore = referenceScore + Math.log(referenceLength / Math.max(averageLength, 1)) / decayFactor;
  
  return Math.max(1, Math.min(10, Math.round(rawScore * 10) / 10));
}