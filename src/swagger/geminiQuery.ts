// src/swagger/geminiQuery.ts

const API_VERSION = process.env.API_VERSION || 'v1';

const geminiQueryPaths = {
  [`/api/${API_VERSION}/gemini/models/{model}:generateContent`]: {
    post: {
      summary: 'Gemini batch generation (non‐streaming)',
      description:
        'Generates content from the specified Gemini model in a non-streaming (batch) manner. RAG parameters `n_results` and `rag_type` are now configured via server-side environment variables (`GEMINI_N_RESULTS` and `GEMINI_RAG_TYPE`) and are not accepted in the request body.',
      tags: ['Gemini Query'],
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
      parameters: [
        {
          name: 'model',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            example: 'gemini-2.0-flash-lite',
          },
          description: 'Name of the model to use e.g. gemini-2.0-flash-lite.',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['contents'],
              properties: {
                contents: {
                  type: 'array',
                  description: "An array of content parts, typically a single 'user' role content part for a query.",
                  items: {
                    type: 'object',
                    required: ['parts'],
                    properties: {
                      parts: {
                        type: 'array',
                        description: 'An array of parts that make up the content. Typically a single text part.',
                        items: {
                          type: 'object',
                          required: ['text'],
                          properties: {
                            text: {
                              type: 'string',
                              description: "The user's query text.",
                              example: 'What is the capital of France?',
                            },
                          },
                        },
                      },
                      role: {
                        type: 'string',
                        description: "The role of the content provider. Typically 'user'.",
                        example: 'user',
                        enum: ['user', 'model'],
                      },
                    },
                  },
                  example: [
                    {
                      parts: [{ text: 'Hello Gemini!' }],
                      role: 'user',
                    },
                  ],
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Successful batch response (non‐streamed). Returns a JSON object matching `LLMChatResponse`.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Format for non‐streamed LLM response (LLMChatResponse).',
                properties: {
                  id: { type: 'string', example: 'chatcmpl-xxxx' },
                  object: { type: 'string', example: 'chat.completion' },
                  created: { type: 'integer', example: 1677652288 },
                  model: { type: 'string', example: 'gemini-2.0-flash-lite' },
                  choices: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        index: { type: 'integer', example: 0 },
                        message: {
                          type: 'object',
                          properties: {
                            role: { type: 'string', example: 'assistant' },
                            content: {
                              type: 'string',
                              example: 'The capital of France is Paris.',
                            },
                          },
                        },
                        finish_reason: { type: 'string', example: 'stop' },
                      },
                    },
                  },
                  usage: {
                    type: 'object',
                    properties: {
                      prompt_tokens: { type: 'integer', example: 25 },
                      completion_tokens: { type: 'integer', example: 10 },
                      total_tokens: { type: 'integer', example: 35 },
                    },
                  },
                },
              },
            },
          },
        },
        '400': {
          description: 'Bad Request – e.g. missing or invalid `contents` structure.',
        },
        '500': { description: 'Internal Server Error' },
        '503': {
          description: 'Service Unavailable – RAG service or underlying LLM not ready.',
        },
      },
    },
  },

  [`/api/${API_VERSION}/gemini/models/{model}:streamGenerateContent`]: {
    post: {
      summary: 'Gemini streaming generation (SSE)',
      description:
        'Generates content from the specified Gemini model using Server-Sent Events (SSE) for streaming. RAG parameters `n_results` and `rag_type` are now configured via server-side environment variables (`GEMINI_N_RESULTS` and `GEMINI_RAG_TYPE`) and are not accepted in the request body.',
      tags: ['Gemini Query'],
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
      parameters: [
        {
          name: 'model',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            example: 'gemini-2.0-flash-lite',
          },
          description: 'Name of the model to use e.g. gemini-2.0-flash-lite.',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['contents'],
              properties: {
                contents: {
                  type: 'array',
                  description: "An array of content parts, typically a single 'user' role content part for a query.",
                  items: {
                    type: 'object',
                    required: ['parts'],
                    properties: {
                      parts: {
                        type: 'array',
                        description: 'An array of parts that make up the content. Typically a single text part.',
                        items: {
                          type: 'object',
                          required: ['text'],
                          properties: {
                            text: {
                              type: 'string',
                              description: "The user's query text.",
                              example: 'Provide a summary of document Y.',
                            },
                          },
                        },
                      },
                      role: {
                        type: 'string',
                        description: "The role of the content provider. Typically 'user'.",
                        example: 'user',
                        enum: ['user', 'model'],
                      },
                    },
                  },
                  example: [
                    {
                      parts: [{ text: 'Summarize this for me.' }],
                      role: 'user',
                    },
                  ],
                },
              },
            },
          },
        },
      },
      responses: {
        // Note: SSE response is not a typical JSON; use text/event-stream
        '200': {
          description: 'Successful streaming response. Streams chunks as Server-Sent Events (SSE).',
          content: {
            'text/event-stream': {
              schema: {
                type: 'string',
                description:
                  'A sequence of SSE‐formatted `data: {...}` lines. Each event is a JSON‐serialized `LLMStreamChunk`. End with `[DONE]`.',
                example:
                  'data: { "id": "chatcmpl-xxxx", "object": "chat.completion.chunk", "created": 1677652288, "model": "gemini-2.0-flash-lite", "choices": [ { "index": 0, "delta": { "content": "Part 1 of answer" }, "finish_reason": null } ] }\n\ndata: { "id": "chatcmpl-xxxx", "object": "chat.completion.chunk", "created": 1677652288, "model": "gemini-2.0-flash-lite", "choices": [ { "index": 0, "delta": { "content": " Part 2 of answer" }, "finish_reason": null } ] }\n\ndata: [DONE]\n\n',
              },
            },
          },
        },
        '400': {
          description: 'Bad Request – e.g. missing or invalid `contents` structure.',
        },
        '500': { description: 'Internal Server Error' },
        '503': {
          description: 'Service Unavailable – RAG service or LLM provider not ready.',
        },
      },
    },
  },
};

export default geminiQueryPaths;
