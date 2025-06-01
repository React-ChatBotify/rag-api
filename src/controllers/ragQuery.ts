import { Request, Response } from 'express';
import { initializedRagService } from '../services/ragService';
import parentDocumentService from '../services/parentDocumentService'; // Added
import { config } from '../config'; // Used for potential fallback model names if not sending through llmWrapper
import { generateText } from '../services/llmWrapper';
import {
    LLMChatResponse,
    LLMStreamChunk,
    // Specific types below usually not needed due to discriminated unions, but can be for clarity
    // OpenAIChatCompletionResponse,
    // GeminiChatCompletionResponse,
    // OpenAIChatCompletionChunk,
    // GeminiStreamChunk,
} from '../types';

export const handleRagQuery = async (req: Request, res: Response) => {
    try {
        const { query, provider: requestProvider, model, n_results, stream, rag_type: raw_rag_type } = req.body;

        if (!query || typeof query !== 'string' || query.trim() === '') {
            return res.status(400).json({ error: "Bad Request: query is required and must be a non-empty string." });
        }

        const provider = requestProvider || 'gemini'; // Default to 'gemini'

        if (provider !== 'openai' && provider !== 'gemini') {
            return res.status(400).json({ error: "Bad Request: provider must be 'openai' or 'gemini'." });
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
        const shouldStream = stream === true;
        // Model selection is now primarily handled by llmWrapper,
        // but we can pass `model` from request body if provided.

        const ragService = await initializedRagService;
        const chunks = await ragService.queryChunks(query, numberOfResults);

        let augmentedPrompt: string;
        let systemPrompt = "You are a helpful assistant.";

        if (!chunks || chunks.length === 0) {
            console.warn(`No relevant chunks found for query: "${query}". Querying LLM directly without RAG context.`);
            augmentedPrompt = query; // Use original query
        } else {
            let contextContent: string[] = [];
            if (rag_type === 'advanced') {
                const uniqueParentIds = new Set<string>();
                chunks.forEach(chunk => {
                    if (chunk.metadata && typeof chunk.metadata.parent_document_id === 'string') {
                        uniqueParentIds.add(chunk.metadata.parent_document_id);
                    }
                });

                if (uniqueParentIds.size > 0) {
                    const parentContents: string[] = [];
                    for (const docId of uniqueParentIds) {
                        const content = await parentDocumentService.getDocument(docId);
                        if (content !== null) {
                            parentContents.push(content);
                        }
                    }
                    if (parentContents.length > 0) {
                        contextContent = parentContents;
                    }
                }
            } else { // rag_type === 'basic'
                chunks.forEach(chunk => {
                    if (chunk.metadata && typeof chunk.metadata.text_chunk === 'string') {
                        contextContent.push(chunk.metadata.text_chunk);
                    } else if (typeof chunk.document === 'string' && chunk.document.trim() !== '') {
                        // Fallback for basic if text_chunk is somehow not in metadata but document content is there
                        // This is less ideal as ragService is expected to populate metadata.text_chunk
                        contextContent.push(chunk.document);
                    }
                });
            }

            if (contextContent.length === 0) {
                console.warn(`Chunks were found for query "${query}" (rag_type: ${rag_type}), but no relevant content could be extracted. Querying LLM directly.`);
                augmentedPrompt = query;
            } else {
                const context = contextContent.join("\n---\n");
                systemPrompt = "You are a helpful assistant that answers questions based on the provided context.";
                const contextDescription = rag_type === 'advanced' ? "Relevant Information from Parent Documents" : "Relevant Text Chunks";
                augmentedPrompt = `User Query: ${query}\n\n${contextDescription}:\n---\n${context}\n---\nBased on the relevant information above, answer the user query.`;
            }
        }
        // System prompt is implicitly part of augmentedPrompt for OpenAI if needed,
        // or handled by Gemini's content structure.
        // For llmWrapper, we just pass the main user query (which is augmented).

        console.log(`INFO: Selected provider: ${provider}. RAG Type: ${rag_type}. Streaming: ${shouldStream}. Model: ${model || 'default'}`);

        try {
            if (shouldStream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders(); // Send headers immediately

                await generateText({
                    provider: provider as 'openai' | 'gemini',
                    query: augmentedPrompt, // This now includes context and original query
                    stream: true,
                    model: model, // Pass model if provided in request
                    onChunk: (chunk: LLMStreamChunk) => {
                        // The chunk is already { ...ProviderChunk, provider }
                        // Send it in SSE format
                        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }
                });
                res.end(); // Close the connection once generateText promise resolves
            } else {
                const llmResponse = await generateText({
                    provider: provider as 'openai' | 'gemini',
                    query: augmentedPrompt,
                    stream: false,
                    model: model, // Pass model if provided in request
                }) as LLMChatResponse; // Not void because stream is false

                // The llmResponse is already a discriminated union with the provider field
                // and the provider-specific response structure.
                // As per instructions, send the provider-specific response.
                res.status(200).json(llmResponse);
            }
        } catch (llmError: any) {
            console.error(`Error calling llmWrapper for provider ${provider} (model: ${model || 'default'}):`, llmError);
            if (!res.headersSent) {
                // If headers not sent, we can still send a normal JSON error response
                return res.status(500).json({ error: `Failed to get response from LLM provider ${provider}.`, details: llmError.message });
            } else if (!res.writableEnded) {
                // If headers sent (streaming), try to write an error to the stream and end it.
                res.write(`data: ${JSON.stringify({ error: "Stream error", details: llmError.message })}\n\n`);
                res.end();
            }
        }

    } catch (error: any) {
        console.error(`Error in handleRagQuery for query "${req.body.query}" (model: ${req.body.model || 'default'}) with provider "${req.body.provider || 'default'}":`, error);
        // Ensure not to set status or json if headers already sent (e.g. during streaming)
        if (!res.headersSent) {
            if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
                return res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
            }
            if (error.message && error.message.includes("Failed to initialize embedding pipeline")) {
                return res.status(503).json({ error: "Service Unavailable: Embedding model not ready." });
            }
            return res.status(500).json({ error: "Internal Server Error", details: error.message });
        } else if (!res.writableEnded){
            // If streaming and an error occurs, and we haven't already ended the stream due to an LLM error.
            console.error("Headers already sent, but stream not ended. Attempting to end stream gracefully after error.");
            res.end();
        }
    }
};
