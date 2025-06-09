import * as Gemini from './gemini';

// ProviderType is removed as it's no longer needed.

export type LLMChatRequestOptions = {
  // provider field removed
  query: string;
  stream?: boolean;
  model?: string; // Optional model override
  onChunk?: (rawSseLine: string) => void; // For streaming, expects a raw SSE line string
  // Add other common parameters like temperature, max_tokens if they are to be abstracted.
};

export type LLMEmbeddingsRequestOptions = {
  // provider field removed
  text: string | string[]; // Allow single or multiple texts for embeddings
  model?: string; // Optional model override
};

// Types are no longer unions and no longer have the provider field.
export type LLMChatResponse = Gemini.GeminiChatCompletionResponse;

export type LLMEmbeddingsResponse = Gemini.GeminiBatchEmbeddingsResponse;

export type LLMStreamChunk = Gemini.GeminiStreamChunk;
