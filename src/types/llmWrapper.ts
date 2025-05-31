import * as OpenAI from './openai';
import * as Gemini from './gemini';

export type ProviderType = 'openai' | 'gemini';

export interface LLMChatRequestOptions {
  provider: ProviderType;
  query: string; // Simplified for now, will be mapped to provider-specific messages/contents
  stream?: boolean;
  model?: string; // Optional model override
  onChunk?: (
    chunk: OpenAI.OpenAIChatCompletionChunk | Gemini.GeminiStreamChunk
  ) => void; // For streaming
  // Add other common parameters like temperature, max_tokens if they are to be abstracted.
}

export interface LLMEmbeddingsRequestOptions {
  provider: ProviderType;
  text: string; // Changed from `text?: string; texts?: string[]` to simplify
  model?: string; // Optional model override
}

export type LLMChatResponse =
  | (OpenAI.OpenAIChatCompletionResponse & { provider: 'openai' })
  | (Gemini.GeminiChatCompletionResponse & { provider: 'gemini' });

export type LLMEmbeddingsResponse =
  | (OpenAI.OpenAIEmbeddingsResponse & { provider: 'openai' })
  | (Gemini.GeminiBatchEmbeddingsResponse & { provider: 'gemini' });

export type LLMStreamChunk =
  | (OpenAI.OpenAIChatCompletionChunk & { provider: 'openai' })
  | (Gemini.GeminiStreamChunk & { provider: 'gemini' });
