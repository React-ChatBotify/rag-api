import {
  LLMChatRequestOptions,
  LLMEmbeddingsRequestOptions,
  LLMChatResponse,
  LLMEmbeddingsResponse,
  LLMStreamChunk,
  OpenAIChatCompletionRequestPayload,
  OpenAIChatCompletionChunk,
  OpenAIEmbeddingsPayload,
  GeminiContent,
  GeminiStreamChunk,
  GeminiBatchEmbeddingsRequest,
  OpenAIChatCompletionResponse, // For casting
  OpenAIEmbeddingModel,
  GeminiChatModel as GeminiModelName, // Renaming for clarity if GeminiChatModel is also a type
  GeminiEmbeddingModel,
} from '../types';
import { fetchOpenaiResponse, getOpenaiEmbedding } from './openai';
import {
  batchGenerateContent as batchGeminiGenerate,
  streamGenerateContent as streamGeminiGenerate,
  batchEmbedContents as batchGeminiEmbeddings,
} from './gemini';
import { config } from '../config';

// Helper to ensure Gemini model name is correctly prefixed
const ensureGeminiModelPrefixed = (modelId: string): string => {
  if (!modelId.startsWith('models/')) {
    return `models/${modelId}`;
  }
  return modelId;
};

export const generateText = async (options: LLMChatRequestOptions): Promise<LLMChatResponse | void> => {
  const { provider, query, stream, model, onChunk } = options;

  if (!query) {
    throw new Error('Query is required for text generation.');
  }

  try {
    if (provider === 'openai') {
      const openaiModel = model || config.openAiChatModel || 'gpt-3.5-turbo';
      const openaiPayload: OpenAIChatCompletionRequestPayload = {
        model: openaiModel as OpenAIEmbeddingModel, // Cast needed if OpenAIChatModel is a strict literal set
        messages: [{ role: 'user', content: query }],
        stream: !!stream,
        // TODO: Map other common options from LLMChatRequestOptions to openaiPayload
        // e.g., temperature, max_tokens
      };

      if (stream) {
        if (!onChunk) {
          throw new Error('onChunk callback is required for streaming responses.');
        }
        await fetchOpenaiResponse(openaiPayload, (chunk: OpenAIChatCompletionChunk) => {
          onChunk({ ...chunk, provider: 'openai' } as LLMStreamChunk);
        });
        return; // Void return for handled stream
      } else {
        const response = (await fetchOpenaiResponse(openaiPayload)) as OpenAIChatCompletionResponse;
        return { ...response, provider: 'openai' };
      }
    } else if (provider === 'gemini') {
      const geminiModelId = model || config.geminiChatModel || 'gemini-pro';
      const geminiContents: GeminiContent[] = [{ role: 'user', parts: [{ text: query }] }]; // Gemini now supports role in contents

      if (stream) {
        if (!onChunk) {
          throw new Error('onChunk callback is required for streaming responses.');
        }
        await streamGeminiGenerate(
          geminiModelId as GeminiModelName, // Cast if GeminiChatModel is a strict literal
          geminiContents,
          (chunk: GeminiStreamChunk) => { // GeminiStreamChunk is GeminiChatCompletionResponse
            onChunk({ ...chunk, provider: 'gemini' } as LLMStreamChunk);
          }
        );
        return; // Void return for handled stream
      } else {
        const response = await batchGeminiGenerate(geminiModelId as GeminiModelName, geminiContents);
        return { ...response, provider: 'gemini' };
      }
    } else {
      // Should be caught by TypeScript, but as a safeguard:
      throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    console.error(`Error generating text with ${provider}:`, error);
    // Re-throw or handle as appropriate for the application
    throw error;
  }
};

export const generateEmbeddings = async (options: LLMEmbeddingsRequestOptions): Promise<LLMEmbeddingsResponse> => {
  const { provider, texts, model } = options;

  if (!texts || texts.length === 0) {
    throw new Error('Texts are required for generating embeddings.');
  }

  try {
    if (provider === 'openai') {
      const openaiEmbeddingModel = model || config.openAiEmbeddingModel || 'text-embedding-ada-002';
      const openaiPayload: OpenAIEmbeddingsPayload = {
        input: texts,
        model: openaiEmbeddingModel as OpenAIEmbeddingModel, // Cast if strict literal
      };
      const response = await getOpenaiEmbedding(openaiPayload);
      return { ...response, provider: 'openai' };
    } else if (provider === 'gemini') {
      const geminiEmbeddingModelId = model || config.geminiEmbeddingModel || 'text-embedding-004';
      // Each request for Gemini batch embeddings needs the model name prefixed.
      const prefixedModelId = ensureGeminiModelPrefixed(geminiEmbeddingModelId as GeminiEmbeddingModel);

      const geminiRequests = texts.map((text) => ({
        model: prefixedModelId,
        content: { parts: [{ text }] },
        // task_type could be set here if needed, e.g., 'RETRIEVAL_DOCUMENT'
      }));

      const geminiPayload: GeminiBatchEmbeddingsRequest = {
        requests: geminiRequests,
      };
      const response = await batchGeminiEmbeddings(geminiPayload);
      return { ...response, provider: 'gemini' };
    } else {
      // Should be caught by TypeScript, but as a safeguard:
      throw new Error(`Unsupported provider for embeddings: ${provider}`);
    }
  } catch (error) {
    console.error(`Error generating embeddings with ${provider}:`, error);
    // Re-throw or handle as appropriate
    throw error;
  }
};
