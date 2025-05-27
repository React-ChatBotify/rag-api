// src/swagger/ragQuery.ts

const API_VERSION = process.env.API_VERSION || 'v1';

const ragQueryPaths = {
    [`/api/${API_VERSION}/rag/query`]: {
        post: {
            summary: "Query the RAG system to get an answer based on stored documents.",
            tags: ["RAG Query"],
            // No 'security' attribute as this endpoint is public
            requestBody: {
                required: true,
                content: {
                    "application/json": {
                        schema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "The user's query.",
                                    example: "What is the main topic of document X?"
                                },
                                llm_model: {
                                    type: "string",
                                    description: "Optional: Specify the LLM model to use (e.g., 'gpt-3.5-turbo', 'gemini-pro'). Defaults to the system's configured default.",
                                    example: "gpt-3.5-turbo"
                                },
                                n_results: {
                                    type: "integer",
                                    description: "Optional: Number of relevant document chunks to retrieve for context. Defaults to 3.",
                                    example: 5
                                },
                                stream: {
                                    type: "boolean",
                                    description: "Optional: Whether to stream the response. Defaults to false.",
                                    example: false
                                }
                            },
                            required: ["query"]
                        }
                    }
                }
            },
            responses: {
                "200": {
                    description: "Successful query. The response format depends on the 'stream' parameter.",
                    content: {
                        "application/json": {
                            schema: {
                                description: "Response for non-streamed queries (stream: false).",
                                type: "object", // Define based on actual non-streamed response
                                properties: {
                                     id: { type: "string", example: "chatcmpl-xxxx" },
                                     object: { type: "string", example: "chat.completion" },
                                     created: { type: "integer", example: 1677652288 },
                                     model: { type: "string", example: "gpt-3.5-turbo" },
                                     choices: {
                                         type: "array",
                                         items: {
                                             type: "object",
                                             properties: {
                                                 index: { type: "integer", example: 0 },
                                                 message: {
                                                     type: "object",
                                                     properties: {
                                                         role: { type: "string", example: "assistant" },
                                                         content: { type: "string", example: "The main topic of document X is..." }
                                                     }
                                                 },
                                                 finish_reason: { type: "string", example: "stop" }
                                             }
                                         }
                                     },
                                     usage: {
                                        type: "object",
                                        properties: {
                                            prompt_tokens: { type: "integer", example: 50 },
                                            completion_tokens: { type: "integer", example: 150 },
                                            total_tokens: { type: "integer", example: 200 }
                                        }
                                     }
                                }
                            }
                        },
                        "text/event-stream": {
                            schema: {
                                description: "Response for streamed queries (stream: true). Each event is a JSON object representing a chunk of the LLM's response.",
                                type: "string", // SSE is a string format, but individual events are JSON
                                example: "data: {\"id\":\"chatcmpl-xxxx\",\"object\":\"chat.completion.chunk\",\"created\":1677652288,\"model\":\"gpt-3.5-turbo\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"The main topic\"},\"finish_reason\":null}]}\n\ndata: {\"id\":\"chatcmpl-xxxx\",\"object\":\"chat.completion.chunk\",\"created\":1677652288,\"model\":\"gpt-3.5-turbo\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" of document X is...\"},\"finish_reason\":null}]}\n\ndata: [DONE]\n\n"
                            }
                        }
                    }
                },
                "400": { description: "Bad Request: Invalid input (e.g., missing query)." },
                "500": { description: "Internal Server Error." },
                "503": { description: "Service Unavailable: RAG service or underlying LLM not ready."}
            }
        }
    }
};

export default ragQueryPaths;
