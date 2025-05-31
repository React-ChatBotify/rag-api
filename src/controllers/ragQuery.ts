import { Request, Response } from 'express';
import { initializedRagService } from '../services/ragService';
import { config } from '../config';
import { generateText } from '../services/llmWrapper'; // Import generateText

export const handleRagQuery = async (req: Request, res: Response) => {
    try {
        const { query, provider: requestProvider, n_results, stream, rag_type: raw_rag_type } = req.body;

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
        // modelToUse will be determined by the llmWrapper based on the provider
        const modelToUse = provider === 'gemini' ? 'gemini-2.0-flash-lite' : 'gpt-4.1-nano'; // Placeholder

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

        const llmPayload = {
            model: modelToUse,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: augmentedPrompt }
            ],
            stream: shouldStream,
        };

        // Placeholder for actual LLM API call
        // This section needs a proper HTTP client like node-fetch or axios
        // And needs to handle actual streaming from the LLM provider
        // The logic for targetUrl, apiKey, and specific payload adaptation
        // will be handled by the llmWrapper in a future step.
        // For now, we acknowledge the provider and simulate a response.

        console.log(`INFO: Selected provider: ${provider}. Model to use (placeholder): ${modelToUse}`);
        // The llmPayload is for OpenAI like structure, llmWrapper will adapt it based on provider.
        // console.log(`INFO: Selected provider: ${provider}. Model to use (placeholder): ${modelToUse}`);

        // The system prompt is now part of the augmentedPrompt logic.
        // llmWrapper expects a simple query string. We pass the augmented prompt.

        try {
            if (shouldStream) {
                // TODO: Implement streaming response handling with llmWrapper
                // For now, llmWrapper.generateText might not fully support streaming to res object.
                // This would require generateText to accept a stream handler or return a stream.
                // For this refactoring, we will return a 501 Not Implemented for streaming requests.
                console.warn(`Streaming for provider ${provider} is not fully implemented yet through llmWrapper.`);
                return res.status(501).json({ error: "Streaming not implemented for this provider via RAG query." });
            } else {
                // Make the call to the LLM via the llmWrapper
                const llmResponse = await generateText({
                    provider: provider as 'openai' | 'gemini', // Cast provider to the expected type
                    query: augmentedPrompt, // Pass the full augmented prompt
                    // stream: false, // Explicitly false, though shouldStream is already false here
                    // model can be omitted to use llmWrapper's default for the provider
                });

                // Send the response from the llmWrapper back to the client
                // The llmResponse structure is { text: string, provider_model?: string, finish_reason?: string }
                // We might want to wrap this in a structure similar to what was simulated before for consistency,
                // or define a new response structure for RAG queries.
                // For now, let's adapt it slightly to resemble the previous non-streaming structure.
                res.status(200).json({
                    id: `rag_cmpl-${provider}-${Date.now()}`, // Generate a simple ID
                    object: "text_completion", // Or a more RAG-specific object type
                    created: Math.floor(Date.now() / 1000),
                    provider: provider,
                    model: llmResponse.provider_model || modelToUse, // Use model from llmResponse or fallback
                    choices: [{
                        index: 0,
                        message: {
                            role: "assistant",
                            content: llmResponse.text,
                        },
                        finish_reason: llmResponse.finish_reason || "stop", // Fallback if not provided
                    }],
                    // Usage data is not currently part of llmWrapper's TextGenerationResponse.
                    // usage: { ... }
                });
            }
        } catch (llmError: any) {
            console.error(`Error calling llmWrapper for provider ${provider}:`, llmError);
            if (!res.headersSent) {
                 return res.status(500).json({ error: `Failed to get response from LLM provider ${provider}.`, details: llmError.message });
            }
        }

    } catch (error: any) {
        console.error(`Error in handleRagQuery for query "${req.body.query}" with provider "${req.body.provider || 'default'}":`, error);
        if (!res.headersSent) {
            if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
                return res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
            }
            if (error.message && error.message.includes("Failed to initialize embedding pipeline")) {
                return res.status(503).json({ error: "Service Unavailable: Embedding model not ready." });
            }
            return res.status(500).json({ error: "Internal Server Error", details: error.message });
        }
    }
};
