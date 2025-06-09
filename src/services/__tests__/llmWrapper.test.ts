import { config } from '../../config';
import {
  GeminiBatchEmbeddingsRequest,
  GeminiBatchEmbeddingsResponse,
  GeminiChatCompletionResponse,
  GeminiContent,
  GeminiEmbedding,
  LLMChatResponse,
  LLMEmbeddingsResponse,
} from '../../types';
import { batchEmbedContents, batchGenerateContent, streamGenerateContent } from '../gemini';
import { generateEmbeddings, generateText } from '../llmWrapper';

const mockStreamGenerateContent = streamGenerateContent as jest.Mock;
const mockBatchGenerateContent = batchGenerateContent as jest.Mock;
const mockBatchEmbedContents = batchEmbedContents as jest.Mock;

jest.mock('../gemini', () => ({
  batchEmbedContents: jest.fn(),
  batchGenerateContent: jest.fn(),
  streamGenerateContent: jest.fn(),
}));

jest.mock('../../config', () => ({
  config: {
    geminiApiKey: 'test-gemini-key',
    geminiChatModel: 'gemini-pro-test',
    geminiEmbeddingModel: 'text-embedding-004-test',
    ragApiKey: 'test-rag-api-key',
  },
}));

describe('LLM Wrapper Service (Gemini-only)', () => {
  const mockQuery = 'Test query';
  const mockText = 'Test text for embedding';
  const mockTexts = ['Test text 1', 'Test text 2'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateText', () => {
    it('should call batchGenerateContent for non-streaming requests and return correct structure', async () => {
      const mockApiResponse: GeminiChatCompletionResponse = {
        candidates: [
          {
            // Added index
            content: { parts: [{ text: 'Gemini response' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      };
      mockBatchGenerateContent.mockResolvedValue(mockApiResponse);

      const result = (await generateText({ query: mockQuery })) as LLMChatResponse;
      const expectedContents: GeminiContent[] = [{ parts: [{ text: mockQuery }], role: 'user' }];

      expect(mockBatchGenerateContent).toHaveBeenCalledWith(config.geminiChatModel, expectedContents);
      expect(result).toEqual(mockApiResponse);
    });

    it('should call streamGenerateContent and trigger onChunk for streaming requests', async () => {
      const mockOnChunk = jest.fn();
      const mockChunk = {
        candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' }, index: 0 }], // Added index
      };

      mockStreamGenerateContent.mockImplementation(async (modelId, contents, onChunkCallback) => {
        if (onChunkCallback) {
          onChunkCallback(mockChunk);
        }
        return Promise.resolve();
      });
      const expectedContents: GeminiContent[] = [{ parts: [{ text: mockQuery }], role: 'user' }];

      const result = await generateText({ onChunk: mockOnChunk, query: mockQuery, stream: true });

      expect(mockStreamGenerateContent).toHaveBeenCalledWith(
        config.geminiChatModel,
        expectedContents,
        expect.any(Function)
      );
      expect(mockOnChunk).toHaveBeenCalledWith(mockChunk);
      expect(result).toBeUndefined();
    });

    it('should use provided model for generateText (non-streaming)', async () => {
      const customModel = 'gemini-custom-model-test';
      mockBatchGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [] }, finishReason: 'STOP', index: 0 }],
      } as GeminiChatCompletionResponse); // Ensure mock response is valid
      await generateText({ model: customModel, query: mockQuery });
      expect(mockBatchGenerateContent).toHaveBeenCalledWith(customModel, expect.any(Array));
    });

    it('should use provided model for generateText (streaming)', async () => {
      const customModel = 'gemini-custom-stream-model-test';
      mockStreamGenerateContent.mockImplementation(async () => {});
      await generateText({ model: customModel, onChunk: jest.fn(), query: mockQuery, stream: true });
      expect(mockStreamGenerateContent).toHaveBeenCalledWith(customModel, expect.any(Array), expect.any(Function));
    });

    it('should throw error if query is missing for generateText', async () => {
      await expect(generateText({ query: '' })).rejects.toThrow('Query is required for text generation.');
    });

    it('should throw error if stream is true but onChunk is missing', async () => {
      await expect(generateText({ query: mockQuery, stream: true })).rejects.toThrow(
        'onChunk callback is required for streaming responses.'
      );
    });
  });

  describe('generateEmbeddings', () => {
    it('should call batchEmbedContents and return correct structure for a single text', async () => {
      const mockApiResponse: GeminiBatchEmbeddingsResponse = {
        embeddings: [{ model: `models/${config.geminiEmbeddingModel}`, values: [0.3, 0.4] } as GeminiEmbedding],
      };
      mockBatchEmbedContents.mockResolvedValue(mockApiResponse);

      const prefixedModelId = `models/${config.geminiEmbeddingModel}`;
      const expectedPayload: GeminiBatchEmbeddingsRequest = {
        requests: [
          {
            content: { parts: [{ text: mockText }] },
            model: prefixedModelId,
          },
        ],
      };

      const result = (await generateEmbeddings({ text: mockText })) as LLMEmbeddingsResponse;
      expect(mockBatchEmbedContents).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockApiResponse);
    });

    it('should call batchEmbedContents and return correct structure for multiple texts', async () => {
      const mockApiResponse: GeminiBatchEmbeddingsResponse = {
        embeddings: [
          { model: `models/${config.geminiEmbeddingModel}`, values: [0.3, 0.4] },
          { model: `models/${config.geminiEmbeddingModel}`, values: [0.5, 0.6] },
        ],
      };
      mockBatchEmbedContents.mockResolvedValue(mockApiResponse);

      const prefixedModelId = `models/${config.geminiEmbeddingModel}`;
      const expectedPayload: GeminiBatchEmbeddingsRequest = {
        requests: mockTexts.map((t) => ({
          content: { parts: [{ text: t }] },
          model: prefixedModelId,
        })),
      };
      const result = (await generateEmbeddings({ text: mockTexts })) as LLMEmbeddingsResponse;
      expect(mockBatchEmbedContents).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockApiResponse);
    });

    it('should use provided model for Gemini embeddings and prefix it correctly', async () => {
      const customModel = 'embedding-custom-test';
      mockBatchEmbedContents.mockResolvedValue({ embeddings: [] } as GeminiBatchEmbeddingsResponse); // Ensure mock response is valid
      await generateEmbeddings({ model: customModel, text: mockText });
      expect(mockBatchEmbedContents).toHaveBeenCalledWith(
        expect.objectContaining({
          requests: expect.arrayContaining([expect.objectContaining({ model: `models/${customModel}` })]),
        })
      );
    });

    it('should throw error if text is empty string for generateEmbeddings', async () => {
      await expect(generateEmbeddings({ text: '' })).rejects.toThrow(
        'Non-empty text(s) are required for generating embeddings.'
      );
    });

    it('should throw error if texts array is empty for generateEmbeddings', async () => {
      await expect(generateEmbeddings({ text: [] })).rejects.toThrow(
        'Non-empty text(s) are required for generating embeddings.'
      );
    });

    it('should throw error if texts array contains empty string for generateEmbeddings', async () => {
      await expect(generateEmbeddings({ text: [mockText, ''] })).rejects.toThrow(
        'Non-empty text(s) are required for generating embeddings.'
      );
    });
  });
});
