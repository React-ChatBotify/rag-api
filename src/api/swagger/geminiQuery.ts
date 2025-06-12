// src/swagger/geminiQuery.ts

const API_VERSION = process.env.API_VERSION || 'v1';

const geminiQueryPaths = {
  [`/api/${API_VERSION}/gemini/models/{model}:generateContent`]: {
    post: {
      description:
        'Generates content from the specified Gemini model in a non-streaming (batch) manner. RAG parameters `n_results` and `rag_type` are now configured via server-side environment variables (`GEMINI_N_RESULTS` and `GEMINI_RAG_TYPE`) and are not accepted in the request body.',
      parameters: [
        {
          description: 'Name of the model to use e.g. gemini-2.0-flash-lite.',
          in: 'path',
          name: 'model',
          required: true,
          schema: {
            example: 'gemini-2.0-flash-lite',
            type: 'string',
          },
        },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              properties: {
                contents: {
                  description: "An array of content parts, typically a single 'user' role content part for a query.",
                  example: [
                    {
                      parts: [{ text: 'Hello Gemini!' }],
                      role: 'user',
                    },
                  ],
                  items: {
                    required: ['parts'],
                    properties: {
                      parts: {
                        description: 'An array of parts that make up the content. Typically a single text part.',
                        type: 'array',
                        items: {
                          required: ['text'],
                          type: 'object',
                          properties: {
                            text: {
                              description: "The user's query text.",
                              type: 'string',
                              example: 'What is the capital of France?',
                            },
                          },
                        },
                      },
                      role: {
                        description: "The role of the content provider. Typically 'user'.",
                        type: 'string',
                        enum: ['user', 'model'],
                        example: 'user',
                      },
                    },
                    type: 'object',
                  },
                  type: 'array',
                },
              },
              required: ['contents'],
              type: 'object',
            },
          },
        },
        required: true,
      },
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                description: 'Format for non‐streamed LLM response (LLMChatResponse).',
                properties: {
                  choices: {
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
                    type: 'array',
                  },
                  created: { example: 1677652288, type: 'integer' },
                  id: { example: 'chatcmpl-xxxx', type: 'string' },
                  model: { example: 'gemini-2.0-flash-lite', type: 'string' },
                  object: { example: 'chat.completion', type: 'string' },
                  usage: {
                    properties: {
                      completion_tokens: { example: 10, type: 'integer' },
                      prompt_tokens: { example: 25, type: 'integer' },
                      total_tokens: { example: 35, type: 'integer' },
                    },
                    type: 'object',
                  },
                },
                type: 'object',
              },
            },
          },
          description: 'Successful batch response (non‐streamed). Returns a JSON object matching `LLMChatResponse`.',
        },
        '400': {
          description: 'Bad Request – e.g. missing or invalid `contents` structure.',
        },
        '500': { description: 'Internal Server Error' },
        '503': {
          description: 'Service Unavailable – RAG service or underlying LLM not ready.',
        },
      },
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
      summary: 'Gemini batch generation (non‐streaming)',
      tags: ['Gemini Query'],
    },
  },

  [`/api/${API_VERSION}/gemini/models/{model}:streamGenerateContent`]: {
    post: {
      description:
        'Generates content from the specified Gemini model using Server-Sent Events (SSE) for streaming. RAG parameters `n_results` and `rag_type` are now configured via server-side environment variables (`GEMINI_N_RESULTS` and `GEMINI_RAG_TYPE`) and are not accepted in the request body.',
      parameters: [
        {
          description: 'Name of the model to use e.g. gemini-2.0-flash-lite.',
          in: 'path',
          name: 'model',
          required: true,
          schema: {
            example: 'gemini-2.0-flash-lite',
            type: 'string',
          },
        },
      ],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              properties: {
                contents: {
                  description: "An array of content parts, typically a single 'user' role content part for a query.",
                  example: [
                    {
                      parts: [{ text: 'Summarize this for me.' }],
                      role: 'user',
                    },
                  ],
                  items: {
                    required: ['parts'],
                    properties: {
                      parts: {
                        description: 'An array of parts that make up the content. Typically a single text part.',
                        type: 'array',
                        items: {
                          required: ['text'],
                          type: 'object',
                          properties: {
                            text: {
                              description: "The user's query text.",
                              type: 'string',
                              example: 'Provide a summary of document Y.',
                            },
                          },
                        },
                      },
                      role: {
                        description: "The role of the content provider. Typically 'user'.",
                        type: 'string',
                        enum: ['user', 'model'],
                        example: 'user',
                      },
                    },
                    type: 'object',
                  },
                  type: 'array',
                },
              },
              required: ['contents'],
              type: 'object',
            },
          },
        },
        required: true,
      },
      responses: {
        // Note: SSE response is not a typical JSON; use text/event-stream
        '200': {
          content: {
            'text/event-stream': {
              schema: {
                description:
                  'A sequence of SSE‐formatted `data: {...}` lines. Each event is a JSON‐serialized `LLMStreamChunk`. End with `[DONE]`.',
                example:
                  'data: { "id": "chatcmpl-xxxx", "object": "chat.completion.chunk", "created": 1677652288, "model": "gemini-2.0-flash-lite", "choices": [ { "index": 0, "delta": { "content": "Part 1 of answer" }, "finish_reason": null } ] }\n\ndata: { "id": "chatcmpl-xxxx", "object": "chat.completion.chunk", "created": 1677652288, "model": "gemini-2.0-flash-lite", "choices": [ { "index": 0, "delta": { "content": " Part 2 of answer" }, "finish_reason": null } ] }\n\ndata: [DONE]\n\n',
                type: 'string',
              },
            },
          },
          description: 'Successful streaming response. Streams chunks as Server-Sent Events (SSE).',
        },
        '400': {
          description: 'Bad Request – e.g. missing or invalid `contents` structure.',
        },
        '500': { description: 'Internal Server Error' },
        '503': {
          description: 'Service Unavailable – RAG service or LLM provider not ready.',
        },
      },
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
      summary: 'Gemini streaming generation (SSE)',
      tags: ['Gemini Query'],
    },
  },
};

export default geminiQueryPaths;
