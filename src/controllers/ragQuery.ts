import { Request, Response } from 'express';
import { initializedRagService } from '../services/ragService';
import { config } from '../config';
// We need a generic way to make LLM calls.
// Let's assume a new service or direct fetch for now, as existing ones are pure proxies.
// For this example, we'll simulate the fetch call. `node-fetch` would be typical.
// import fetch from 'node-fetch'; // Example: if node-fetch is available

export const handleRagQuery = async (req: Request, res: Response) => {
    try {
        const { query, llm_model, n_results, stream } = req.body;

        if (!query || typeof query !== 'string' || query.trim() === '') {
            return res.status(400).json({ error: "Bad Request: query is required and must be a non-empty string." });
        }

        const numberOfResults = typeof n_results === 'number' && n_results > 0 ? n_results : 3;
        // Default to OpenAI model if not specified, or use a configured default RAG LLM model
        const modelToUse = llm_model || 'gpt-3.5-turbo'; // Make this configurable
        const shouldStream = stream === true;

        const ragService = await initializedRagService;
        const chunks = await ragService.queryChunks(query, numberOfResults);

        let augmentedPrompt: string;
        let systemPrompt = "You are a helpful assistant.";

        if (!chunks || chunks.length === 0) {
            console.warn(`No relevant chunks found for query: "${query}". Querying LLM directly without RAG context.`);
            augmentedPrompt = query; // Use original query
        } else {
            const uniqueParentContents = new Set<string>();
            chunks.forEach(chunk => {
                // Ensure metadata and original_content exist
                if (chunk.metadata && typeof chunk.metadata.original_content === 'string') {
                    uniqueParentContents.add(chunk.metadata.original_content);
                } else if (typeof chunk.document === 'string' && chunk.document.trim() !== '') {
                    // Fallback to document if original_content is not in metadata (should not happen with current ragService)
                    // This indicates a potential issue with how original_content is stored/retrieved if it's missing.
                    // For now, we assume text_chunk is what's in chunk.document if metadata isn't structured as expected.
                    // The RAG service stores 'original_content' in metadata, so this path is less likely.
                    // Sticking to 'original_content' from metadata is preferred.
                    // If 'original_content' is missing, it implies an issue upstream in RAGService's addDocument or queryChunks.
                }
            });

            if (uniqueParentContents.size === 0) {
                console.warn(`Chunks were found for query "${query}", but no 'original_content' could be extracted. Querying LLM directly.`);
                augmentedPrompt = query;
            } else {
                const context = Array.from(uniqueParentContents).join("\n---\n");
                systemPrompt = "You are a helpful assistant that answers questions based on the provided context.";
                augmentedPrompt = `User Query: ${query}\n\nRelevant Information:\n---\n${context}\n---\nBased on the relevant information above, answer the user query.`;
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
        
        // Determine provider based on model (simplified)
        let targetUrl: string;
        let apiKey: string;

        if (modelToUse.startsWith('gpt-')) { // OpenAI
            targetUrl = `${config.openaiBaseUrl}/chat/completions`;
            apiKey = config.openaiApiKey;
        } else if (modelToUse.startsWith('gemini-')) { // Gemini
            // Gemini API structure is different, e.g. /v1beta/models/gemini-pro:generateContent
            // This simplification won't directly work for Gemini without adapting the payload and endpoint.
            // For now, this example focuses on OpenAI-like API structure.
            // A more robust solution would involve an LLM service layer.
            targetUrl = `${config.geminiBaseUrl}/models/${modelToUse}:streamGenerateContent`; // Or non-streaming endpoint
             if(shouldStream){
                targetUrl = `${config.geminiBaseUrl}/models/${modelToUse}:streamGenerateContent`;
            } else {
                targetUrl = `${config.geminiBaseUrl}/models/${modelToUse}:generateContent`;
            }
            apiKey = config.geminiApiKey;
            // Gemini payload is different, need to adapt `llmPayload`
            // e.g. { "contents": [{ "parts": [{ "text": augmentedPrompt }] }] }
            // This highlights the need for an abstraction layer.
             return res.status(501).json({ error: "Gemini model integration is not fully implemented in this RAG query path yet." });
        } else {
            return res.status(400).json({ error: `Unsupported LLM model: ${modelToUse}. Currently supports 'gpt-' prefixed models.` });
        }

        if (!apiKey) {
            return res.status(500).json({ error: `API key for ${modelToUse} is not configured.` });
        }

        try {
            // const response = await fetch(targetUrl, { // Using 'fetch' as if it's available
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json',
            //         'Authorization': `Bearer ${apiKey}`,
            //     },
            //     body: JSON.stringify(llmPayload),
            // });

            // if (!response.ok) {
            //     const errorBody = await response.text();
            //     console.error(`LLM API error: ${response.status} ${response.statusText}`, errorBody);
            //     return res.status(response.status).json({ error: "LLM API request failed.", details: errorBody });
            // }

            // if (shouldStream && response.body) {
            //     res.setHeader('Content-Type', 'text/event-stream');
            //     res.setHeader('Cache-Control', 'no-cache');
            //     res.setHeader('Connection', 'keep-alive');
            //     response.body.pipe(res); // Pipe the stream
            // } else {
            //     const data = await response.json();
            //     res.status(200).json(data);
            // }
            
            // SIMULATED RESPONSE DUE TO LACK OF HTTP CLIENT TOOL
            console.warn("LLM call is simulated. No actual HTTP request was made.");
            if (shouldStream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');

                let timeoutId: NodeJS.Timeout | null = null;

                const sendEvent = (data: any) => {
                    if (!res.writableEnded) { // Check if the stream is still writable
                        res.write(`data: ${JSON.stringify(data)}\n\n`);
                    }
                };

                sendEvent({ "choices": [{ "delta": { "content": `Simulated stream response for query: ${query} with context.` } }] });

                timeoutId = setTimeout(() => {
                    sendEvent({ "choices": [{ "delta": { "content": ` More simulated content.` } }] });
                    sendEvent("[DONE]");
                    if (!res.writableEnded) {
                        res.end();
                    }
                }, 500);

                req.on('close', () => {
                    console.log("Request closed by client, clearing simulation timeout.");
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    // Ensure res.end() is called if not already, to clean up resources
                    if (!res.writableEnded) {
                        res.end();
                    }
                });

            } else {
                res.status(200).json({
                    id: "sim_chatcmpl-xxxxxxxx",
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model: modelToUse,
                    choices: [{
                        index: 0,
                        message: {
                            role: "assistant",
                            content: `Simulated response for query: ${query} with context. Model: ${modelToUse}. Prompt: ${augmentedPrompt}`,
                        },
                        finish_reason: "stop",
                    }],
                    usage: {
                        prompt_tokens: 0, // Simulated
                        completion_tokens: 0, // Simulated
                        total_tokens: 0, // Simulated
                    }
                });
            }

        } catch (fetchError: any) {
            console.error("Error making LLM API call:", fetchError);
            if (!res.headersSent) {
                 return res.status(500).json({ error: "Failed to communicate with LLM provider.", details: fetchError.message });
            }
        }

    } catch (error: any) {
        console.error(`Error in handleRagQuery for query "${req.body.query}":`, error);
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
