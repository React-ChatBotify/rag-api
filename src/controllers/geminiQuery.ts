import { Request, Response } from 'express';
import { initializedRagService } from '../services/ragService';
// config is not used in the new implementation, so it can be removed if not needed by other functions.
// For now, I'll keep it, just in case.
import { config } from '../config';
import { generateText } from '../services/llmWrapper';
import {
    LLMChatResponse,
    LLMStreamChunk,
} from '../types';


export const handleGeminiBatch = async (req: Request, res: Response) => {
    const model = req.params.model;

    try {
        const { query, n_results, rag_type: raw_rag_type } = req.body;

        if (!query || typeof query !== 'string' || query.trim() === '') {
            return res.status(400).json({ error: "Bad Request: query is required and must be a non-empty string." });
        }

        let rag_type = 'basic'; // Default rag_type to 'basic'
        if (raw_rag_type !== undefined) {
            if (raw_rag_type === 'basic' || raw_rag_type === 'advanced') {
                rag_type = raw_rag_type;
            } else {
                return res.status(400).json({ error: "Bad Request: rag_type must be 'basic' or 'advanced'." });
            }
        }

        const numberOfResults = typeof n_results === 'number' && n_results > 0 ? n_results : 3;

        const ragService = await initializedRagService;
        const chunks = await ragService.queryChunks(query, numberOfResults);

        let augmentedPrompt: string;
        if (!chunks || chunks.length === 0) {
            console.warn(`No relevant chunks found for query: "${query}" with model ${model}. Querying LLM directly without RAG context.`);
            augmentedPrompt = query;
        } else {
            let contextContent: string[] = [];
            if (rag_type === 'advanced') {
                const uniqueParentContents = new Set<string>();
                chunks.forEach(chunk => {
                    if (chunk.metadata && typeof chunk.metadata.original_content === 'string') {
                        uniqueParentContents.add(chunk.metadata.original_content);
                    }
                });
                if (uniqueParentContents.size > 0) {
                    contextContent = Array.from(uniqueParentContents);
                }
            } else { // rag_type === 'basic'
                chunks.forEach(chunk => {
                    if (chunk.metadata && typeof chunk.metadata.text_chunk === 'string') {
                        contextContent.push(chunk.metadata.text_chunk);
                    } else if (typeof chunk.document === 'string' && chunk.document.trim() !== '') {
                        contextContent.push(chunk.document);
                    }
                });
            }

            if (contextContent.length === 0) {
                console.warn(`Chunks were found for query "${query}" (rag_type: ${rag_type}, model: ${model}), but no relevant content could be extracted. Querying LLM directly.`);
                augmentedPrompt = query;
            } else {
                const context = contextContent.join("\n---\n");
                const contextDescription = rag_type === 'advanced' ? "Relevant Information from Parent Documents" : "Relevant Text Chunks";
                augmentedPrompt = `User Query: ${query}\n\n${contextDescription}:\n---\n${context}\n---\nBased on the relevant information above, answer the user query.`;
            }
        }

        console.log(`INFO: Gemini Batch Request. Model: ${model}. RAG Type: ${rag_type}.`);

        try {
            const llmResponse = await generateText({
                query: augmentedPrompt,
                stream: false,
                model: model,
            }) as LLMChatResponse;
            res.status(200).json(llmResponse);
        } catch (llmError: any) {
            console.error(`Error calling llmWrapper for Gemini batch (model: ${model}):`, llmError);
            return res.status(500).json({ error: `Failed to get response from LLM provider Gemini.`, details: llmError.message });
        }

    } catch (error: any) {
        console.error(`Error in handleGeminiBatch for model ${model}, query "${req.body.query}":`, error);
        if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
            return res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
        }
        if (error.message && error.message.includes("Failed to initialize embedding pipeline")) {
            return res.status(503).json({ error: "Service Unavailable: Embedding model not ready." });
        }
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

export const handleGeminiStream = async (req: Request, res: Response) => {
    const model = req.params.model;

    try {
        const { query, n_results, rag_type: raw_rag_type } = req.body;

        if (!query || typeof query !== 'string' || query.trim() === '') {
            // Cannot send JSON error if headers already sent, but here they are not.
            return res.status(400).json({ error: "Bad Request: query is required and must be a non-empty string." });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders(); // Send headers immediately

        let rag_type = 'basic'; // Default rag_type to 'basic'
        if (raw_rag_type !== undefined) {
            if (raw_rag_type === 'basic' || raw_rag_type === 'advanced') {
                rag_type = raw_rag_type;
            } else {
                // Headers sent, so must write error to stream
                res.write(`data: ${JSON.stringify({ error: "Bad Request: rag_type must be 'basic' or 'advanced'." })}\n\n`);
                res.end();
                return;
            }
        }

        const numberOfResults = typeof n_results === 'number' && n_results > 0 ? n_results : 3;

        const ragService = await initializedRagService;
        const chunks = await ragService.queryChunks(query, numberOfResults);

        let augmentedPrompt: string;
        if (!chunks || chunks.length === 0) {
            console.warn(`No relevant chunks found for query: "${query}" with model ${model} (stream). Querying LLM directly without RAG context.`);
            augmentedPrompt = query;
        } else {
            let contextContent: string[] = [];
            if (rag_type === 'advanced') {
                const uniqueParentContents = new Set<string>();
                chunks.forEach(chunk => {
                    if (chunk.metadata && typeof chunk.metadata.original_content === 'string') {
                        uniqueParentContents.add(chunk.metadata.original_content);
                    }
                });
                if (uniqueParentContents.size > 0) {
                    contextContent = Array.from(uniqueParentContents);
                }
            } else { // rag_type === 'basic'
                chunks.forEach(chunk => {
                    if (chunk.metadata && typeof chunk.metadata.text_chunk === 'string') {
                        contextContent.push(chunk.metadata.text_chunk);
                    } else if (typeof chunk.document === 'string' && chunk.document.trim() !== '') {
                        contextContent.push(chunk.document);
                    }
                });
            }

            if (contextContent.length === 0) {
                console.warn(`Chunks were found for query "${query}" (rag_type: ${rag_type}, model: ${model}, stream), but no relevant content could be extracted. Querying LLM directly.`);
                augmentedPrompt = query;
            } else {
                const context = contextContent.join("\n---\n");
                const contextDescription = rag_type === 'advanced' ? "Relevant Information from Parent Documents" : "Relevant Text Chunks";
                augmentedPrompt = `User Query: ${query}\n\n${contextDescription}:\n---\n${context}\n---\nBased on the relevant information above, answer the user query.`;
            }
        }

        console.log(`INFO: Gemini Stream Request. Model: ${model}. RAG Type: ${rag_type}.`);

        try {
            await generateText({
                query: augmentedPrompt,
                stream: true,
                model: model,
                onChunk: (chunk: LLMStreamChunk) => {
                    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }
            });
            res.end();
        } catch (llmError: any) {
            console.error(`Error calling llmWrapper for Gemini stream (model: ${model}):`, llmError);
            if (!res.writableEnded) { // Check if stream is still open
                res.write(`data: ${JSON.stringify({ error: `Failed to get response from LLM provider Gemini.`, details: llmError.message })}\n\n`);
                res.end();
            }
        }

    } catch (error: any) {
        console.error(`Error in handleGeminiStream for model ${model}, query "${req.body.query}":`, error);
        if (!res.headersSent) {
            // This case should ideally not be reached if query validation is first.
            // However, for other early errors (like RAG service init), this is a fallback.
             if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
                res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
                return;
            }
            if (error.message && error.message.includes("Failed to initialize embedding pipeline")) {
                res.status(503).json({ error: "Service Unavailable: Embedding model not ready." });
                return;
            }
            res.status(500).json({ error: "Internal Server Error", details: error.message });
        } else if (!res.writableEnded) {
            // Headers sent, stream is open, write error to stream
            let errorMessage = "Internal Server Error";
            if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
                errorMessage = "Service Unavailable: RAG service is not ready.";
            } else if (error.message && error.message.includes("Failed to initialize embedding pipeline")) {
                errorMessage = "Service Unavailable: Embedding model not ready.";
            }
            res.write(`data: ${JSON.stringify({ error: errorMessage, details: error.message })}\n\n`);
            res.end();
        }
        // If res.writableEnded is true, can't do anything more.
    }
};
