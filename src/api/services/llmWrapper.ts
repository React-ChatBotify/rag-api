import { config } from '../config';
import Logger from '../logger';
import {
  GeminiBatchEmbeddingsRequest,
  GeminiChatModel as GeminiModelName,
  GeminiContent,
  GeminiEmbeddingModel,
  LLMChatRequestOptions,
  LLMChatResponse,
  LLMEmbeddingsRequestOptions,
  LLMEmbeddingsResponse,
} from '../types';
import {
  batchEmbedContents as batchGeminiEmbeddings,
  batchGenerateContent as batchGeminiGenerate,
  streamGenerateContent as streamGeminiGenerate,
} from './gemini';

// Helper to ensure Gemini model name is correctly prefixed
const ensureGeminiModelPrefixed = (modelId: string): string => {
  if (!modelId.startsWith('models/')) {
    return `models/${modelId}`;
  }
  return modelId;
};

export const generateText = async (
  options: Omit<LLMChatRequestOptions, 'provider'>
): Promise<LLMChatResponse | void> => {
  const { contents, stream, model, onChunk } = options;

  if (!contents || contents.length === 0) {
    throw new Error('Contents are required for text generation.');
  }

  try {
    const geminiModelId = model || config.geminiChatModel || 'gemini-pro';
    let finalContents = contents;

    if (config.geminiSystemPrompt && config.geminiSystemPrompt.trim() !== '') {
      const systemPromptContent: GeminiContent = { parts: [{ text: config.geminiSystemPrompt }], role: 'user' };
      finalContents = [systemPromptContent, ...contents];
    }

    if (stream) {
      if (!onChunk) {
        throw new Error('onChunk callback is required for streaming responses.');
      }
      // gemini.ts's streamGenerateContent now provides raw SSE lines to its onChunk callback.
      // The onChunk from LLMChatRequestOptions (options.onChunk) will also expect raw SSE lines
      // (this type will be updated in a subsequent step in types.ts).
      // Therefore, we can pass options.onChunk directly.
      await streamGeminiGenerate(geminiModelId as GeminiModelName, finalContents, onChunk);
      return;
    } else {
      const response = await batchGeminiGenerate(geminiModelId as GeminiModelName, finalContents);
      // LLMChatResponse is now GeminiChatCompletionResponse, return directly.
      return response;
    }
  } catch (error) {
    Logger.error(`Error generating text with Gemini:`, error);
    throw error;
  }
};

export const generateEmbeddings = async (
  options: Omit<LLMEmbeddingsRequestOptions, 'provider'>
): Promise<LLMEmbeddingsResponse> => {
  const { text, model } = options;
  const texts = Array.isArray(text) ? text : [text];

  if (!texts || texts.length === 0 || texts.some((t) => !t)) {
    throw new Error('Non-empty text(s) are required for generating embeddings.');
  }

  try {
    const geminiEmbeddingModelId = model || config.geminiEmbeddingModel || 'text-embedding-004';
    const prefixedModelId = ensureGeminiModelPrefixed(geminiEmbeddingModelId as GeminiEmbeddingModel);

    const geminiRequests = texts.map((t) => ({
      content: { parts: [{ text: t }] },
      model: prefixedModelId,
    }));

    const geminiPayload: GeminiBatchEmbeddingsRequest = {
      requests: geminiRequests,
    };
    const response = await batchGeminiEmbeddings(geminiPayload);
    // LLMEmbeddingsResponse is now GeminiBatchEmbeddingsResponse, return directly.
    return response;
  } catch (error) {
    Logger.error(`Error generating embeddings with Gemini:`, error);
    throw error;
  }
};
