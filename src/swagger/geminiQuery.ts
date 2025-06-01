// src/swagger/geminiQuery.ts

const API_VERSION = process.env.API_VERSION || 'v1';

const geminiQueryPaths = {
  [`/api/${API_VERSION}/gemini/models/{model}:generateContent`]: {
    post: {
      summary: "Gemini batch generation (non‐streaming)",
      tags: ["Gemini Query"],
      parameters: [
        {
          name: "model",
          in: "path",
          required: true,
          schema: {
            type: "string",
            example: "gemini-2.0-flash-lite"
          },
          description:
            "Name of the model to use e.g. gemini-2.0-flash-lite."
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "User's query text.",
                  example: "What is the capital of France?"
                },
                n_results: {
                  type: "integer",
                  description:
                    "Optional: Number of RAG chunks to retrieve. Defaults to 3.",
                  example: 5
                },
                rag_type: {
                  type: "string",
                  description:
                    "Optional: ‘basic’ (default) or ‘advanced’. Determines whether to use text chunks or full parent content for context.",
                  enum: ["basic", "advanced"],
                  default: "basic",
                  example: "advanced"
                }
              },
              required: ["query"]
            }
          }
        }
      },
      responses: {
        "200": {
          description:
            "Successful batch response (non‐streamed). Returns a JSON object matching `LLMChatResponse`.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                description:
                  "Format for non‐streamed LLM response (LLMChatResponse).",
                properties: {
                  id: { type: "string", example: "chatcmpl-xxxx" },
                  object: { type: "string", example: "chat.completion" },
                  created: { type: "integer", example: 1677652288 },
                  model: { type: "string", example: "gemini-2.0-flash-lite" },
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
                            content: {
                              type: "string",
                              example: "The capital of France is Paris."
                            }
                          }
                        },
                        finish_reason: { type: "string", example: "stop" }
                      }
                    }
                  },
                  usage: {
                    type: "object",
                    properties: {
                      prompt_tokens: { type: "integer", example: 25 },
                      completion_tokens: { type: "integer", example: 10 },
                      total_tokens: { type: "integer", example: 35 }
                    }
                  }
                }
              }
            }
          }
        },
        "400": {
          description:
            "Bad Request – e.g. missing or invalid `query` or `rag_type` not in [basic, advanced]."
        },
        "500": { description: "Internal Server Error" },
        "503": {
          description:
            "Service Unavailable – RAG service or underlying LLM not ready."
        }
      }
    }
  },

  [`/api/${API_VERSION}/gemini/models/{model}:streamGenerateContent`]: {
    post: {
      summary: "Gemini streaming generation (SSE)",
      tags: ["Gemini Query"],
      parameters: [
        {
          name: "model",
          in: "path",
          required: true,
          schema: {
            type: "string",
            example: "gemini-2.0-flash-lite"
          },
          description:
            "Name of the model to use e.g. gemini-2.0-flash-lite."
        }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "User's query text.",
                  example: "Provide a summary of document Y."
                },
                n_results: {
                  type: "integer",
                  description:
                    "Optional: Number of RAG chunks to retrieve. Defaults to 3.",
                  example: 3
                },
                rag_type: {
                  type: "string",
                  description:
                    "Optional: ‘basic’ (default) or ‘advanced’. Defaults to ‘basic’.",
                  enum: ["basic", "advanced"],
                  default: "basic",
                  example: "basic"
                }
              },
              required: ["query"]
            }
          }
        }
      },
      responses: {
        // Note: SSE response is not a typical JSON; use text/event-stream
        "200": {
          description:
            "Successful streaming response. Streams chunks as Server-Sent Events (SSE).",
          content: {
            "text/event-stream": {
              schema: {
                type: "string",
                description:
                  "A sequence of SSE‐formatted `data: {...}` lines. Each event is a JSON‐serialized `LLMStreamChunk`. End with `[DONE]`.",
                example:
                  "data: { \"id\": \"chatcmpl-xxxx\", \"object\": \"chat.completion.chunk\", \"created\": 1677652288, \"model\": \"gemini-2.0-flash-lite\", \"choices\": [ { \"index\": 0, \"delta\": { \"content\": \"Part 1 of answer\" }, \"finish_reason\": null } ] }\n\ndata: { \"id\": \"chatcmpl-xxxx\", \"object\": \"chat.completion.chunk\", \"created\": 1677652288, \"model\": \"gemini-2.0-flash-lite\", \"choices\": [ { \"index\": 0, \"delta\": { \"content\": \" Part 2 of answer\" }, \"finish_reason\": null } ] }\n\ndata: [DONE]\n\n"
              }
            }
          }
        },
        "400": {
          description:
            "Bad Request – e.g. missing `query` or invalid `rag_type`."
        },
        "500": { description: "Internal Server Error" },
        "503": {
          description:
            "Service Unavailable – RAG service or LLM provider not ready."
        }
      }
    }
  }
};

export default geminiQueryPaths;
