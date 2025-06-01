import {
  LLMChatRequestOptions,
  LLMEmbeddingsRequestOptions,
  LLMChatResponse,
  LLMEmbeddingsResponse,
  LLMStreamChunk,
  GeminiContent,
  GeminiStreamChunk,
  GeminiBatchEmbeddingsRequest,
  GeminiChatModel as GeminiModelName,
  GeminiEmbeddingModel,
} from '../types';

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

export const generateText = async (options: Omit<LLMChatRequestOptions, 'provider'>): Promise<LLMChatResponse | void> => {
  const { query, stream, model, onChunk } = options;

  if (!query) {
    throw new Error('Query is required for text generation.');
  }

  try {
    const geminiModelId = model || config.geminiChatModel || 'gemini-pro';
    const geminiContents: GeminiContent[] = [{ role: 'user', parts: [{ text: query }] }];

    if (stream) {
      if (!onChunk) {
        throw new Error('onChunk callback is required for streaming responses.');
      }
      await streamGeminiGenerate(
        geminiModelId as GeminiModelName,
        geminiContents,
        (chunk: GeminiStreamChunk) => {
          // LLMStreamChunk is now GeminiStreamChunk, so direct pass is fine.
          onChunk(chunk as LLMStreamChunk);
        }
      );
      return;
    } else {
      const response = await batchGeminiGenerate(geminiModelId as GeminiModelName, geminiContents);
      // LLMChatResponse is now GeminiChatCompletionResponse, return directly.
      return response;
    }
  } catch (error) {
    console.error(`Error generating text with Gemini:`, error);
    throw error;
  }
};

export const generateEmbeddings = async (options: Omit<LLMEmbeddingsRequestOptions, 'provider'>): Promise<LLMEmbeddingsResponse> => {
  const { text, model } = options;
  const texts = Array.isArray(text) ? text : [text];

  if (!texts || texts.length === 0 || texts.some(t => !t)) {
    throw new Error('Non-empty text(s) are required for generating embeddings.');
  }

  try {
    const geminiEmbeddingModelId = model || config.geminiEmbeddingModel || 'text-embedding-004';
    const prefixedModelId = ensureGeminiModelPrefixed(geminiEmbeddingModelId as GeminiEmbeddingModel);

    const geminiRequests = texts.map((t) => ({
      model: prefixedModelId,
      content: { parts: [{ text: t }] },
    }));

    const geminiPayload: GeminiBatchEmbeddingsRequest = {
      requests: geminiRequests,
    };
    const response = await batchGeminiEmbeddings(geminiPayload);
    // LLMEmbeddingsResponse is now GeminiBatchEmbeddingsResponse, return directly.
    return response;
  } catch (error) {
    console.error(`Error generating embeddings with Gemini:`, error);
    throw error;
  }
};
