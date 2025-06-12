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
  const mockSingleContent: GeminiContent[] = [{ parts: [{ text: 'Test query' }], role: 'user' }];
  const mockMultipleContents: GeminiContent[] = [
    { parts: [{ text: 'Hello' }], role: 'user' },
    { parts: [{ text: 'How are you?' }], role: 'model' },
    { parts: [{ text: 'I am fine, thank you!' }], role: 'user' },
  ];
  const mockText = 'Test text for embedding';
  const mockTexts = ['Test text 1', 'Test text 2'];
  let configSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset any spies if they are setup in a way that persists across tests in this describe block
    if (configSpy) {
      configSpy.mockRestore();
    }
  });

  describe('generateText', () => {
    it('should call batchGenerateContent for non-streaming requests with single content item', async () => {
      const mockApiResponse: GeminiChatCompletionResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'Gemini response' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      };
      mockBatchGenerateContent.mockResolvedValue(mockApiResponse);

      const result = (await generateText({ contents: mockSingleContent })) as LLMChatResponse;

      expect(mockBatchGenerateContent).toHaveBeenCalledWith(config.geminiChatModel, mockSingleContent);
      expect(result).toEqual(mockApiResponse);
    });

    it('should call streamGenerateContent and trigger onChunk for streaming requests with single content item', async () => {
      const mockOnChunk = jest.fn();
      const mockChunk = {
        candidates: [{ content: { parts: [{ text: 'Hello' }], role: 'model' }, index: 0 }],
      };

      mockStreamGenerateContent.mockImplementation(async (modelId, contents, onChunkCallback) => {
        if (onChunkCallback) {
          onChunkCallback(mockChunk); // Pass the raw chunk as per current design
        }
        return Promise.resolve();
      });

      const result = await generateText({ contents: mockSingleContent, onChunk: mockOnChunk, stream: true });

      expect(mockStreamGenerateContent).toHaveBeenCalledWith(
        config.geminiChatModel,
        mockSingleContent,
        expect.any(Function)
      );
      expect(mockOnChunk).toHaveBeenCalledWith(mockChunk); // onChunk should receive the raw chunk
      expect(result).toBeUndefined();
    });

    it('should use provided model for generateText (non-streaming)', async () => {
      const customModel = 'gemini-custom-model-test';
      mockBatchGenerateContent.mockResolvedValue({
        candidates: [{ content: { parts: [] }, finishReason: 'STOP', index: 0 }],
      } as GeminiChatCompletionResponse);
      await generateText({ contents: mockSingleContent, model: customModel });
      expect(mockBatchGenerateContent).toHaveBeenCalledWith(customModel, mockSingleContent);
    });

    it('should use provided model for generateText (streaming)', async () => {
      const customModel = 'gemini-custom-stream-model-test';
      mockStreamGenerateContent.mockImplementation(async () => {});
      await generateText({ contents: mockSingleContent, model: customModel, onChunk: jest.fn(), stream: true });
      expect(mockStreamGenerateContent).toHaveBeenCalledWith(customModel, mockSingleContent, expect.any(Function));
    });

    it('should throw error if contents are empty for generateText', async () => {
      await expect(generateText({ contents: [] })).rejects.toThrow('Contents are required for text generation.');
    });

    it('should throw error if contents array is missing for generateText', async () => {
      // @ts-expect-error testing invalid input
      await expect(generateText({ contents: null })).rejects.toThrow('Contents are required for text generation.');
    });

    it('should throw error if stream is true but onChunk is missing', async () => {
      await expect(generateText({ contents: mockSingleContent, stream: true })).rejects.toThrow(
        'onChunk callback is required for streaming responses.'
      );
    });

    describe('System Prompt Integration', () => {
      const systemPromptText = 'You are a helpful assistant.';
      const expectedSystemPromptContent: GeminiContent = { parts: [{ text: systemPromptText }], role: 'user' };

      it('should prepend system prompt if config.geminiSystemPrompt is defined (batch)', async () => {
        configSpy = jest.spyOn(config, 'geminiSystemPrompt', 'get').mockReturnValue(systemPromptText);
        mockBatchGenerateContent.mockResolvedValue({} as GeminiChatCompletionResponse); // Minimal mock

        await generateText({ contents: mockSingleContent });
        expect(mockBatchGenerateContent).toHaveBeenCalledWith(config.geminiChatModel, [
          expectedSystemPromptContent,
          ...mockSingleContent,
        ]);
      });

      it('should prepend system prompt if config.geminiSystemPrompt is defined (stream)', async () => {
        configSpy = jest.spyOn(config, 'geminiSystemPrompt', 'get').mockReturnValue(systemPromptText);
        mockStreamGenerateContent.mockImplementation(async () => {});

        await generateText({ contents: mockSingleContent, onChunk: jest.fn(), stream: true });
        expect(mockStreamGenerateContent).toHaveBeenCalledWith(
          config.geminiChatModel,
          [expectedSystemPromptContent, ...mockSingleContent],
          expect.any(Function)
        );
      });

      it('should NOT prepend system prompt if config.geminiSystemPrompt is empty (batch)', async () => {
        configSpy = jest.spyOn(config, 'geminiSystemPrompt', 'get').mockReturnValue('');
        mockBatchGenerateContent.mockResolvedValue({} as GeminiChatCompletionResponse);

        await generateText({ contents: mockSingleContent });
        expect(mockBatchGenerateContent).toHaveBeenCalledWith(config.geminiChatModel, mockSingleContent);
      });

      it('should NOT prepend system prompt if config.geminiSystemPrompt is undefined (batch)', async () => {
        configSpy = jest.spyOn(config, 'geminiSystemPrompt', 'get').mockReturnValue('');
        mockBatchGenerateContent.mockResolvedValue({} as GeminiChatCompletionResponse);

        await generateText({ contents: mockSingleContent });
        expect(mockBatchGenerateContent).toHaveBeenCalledWith(config.geminiChatModel, mockSingleContent);
      });

      it('should correctly pass multiple content items with system prompt (batch)', async () => {
        configSpy = jest.spyOn(config, 'geminiSystemPrompt', 'get').mockReturnValue(systemPromptText);
        mockBatchGenerateContent.mockResolvedValue({} as GeminiChatCompletionResponse);

        await generateText({ contents: mockMultipleContents });
        expect(mockBatchGenerateContent).toHaveBeenCalledWith(config.geminiChatModel, [
          expectedSystemPromptContent,
          ...mockMultipleContents,
        ]);
      });

      it('should correctly pass multiple content items without system prompt (batch)', async () => {
        configSpy = jest.spyOn(config, 'geminiSystemPrompt', 'get').mockReturnValue('');
        mockBatchGenerateContent.mockResolvedValue({} as GeminiChatCompletionResponse);

        await generateText({ contents: mockMultipleContents });
        expect(mockBatchGenerateContent).toHaveBeenCalledWith(config.geminiChatModel, mockMultipleContents);
      });

      it('should correctly pass multiple content items with system prompt (stream)', async () => {
        configSpy = jest.spyOn(config, 'geminiSystemPrompt', 'get').mockReturnValue(systemPromptText);
        mockStreamGenerateContent.mockImplementation(async () => {});

        await generateText({ contents: mockMultipleContents, onChunk: jest.fn(), stream: true });
        expect(mockStreamGenerateContent).toHaveBeenCalledWith(
          config.geminiChatModel,
          [expectedSystemPromptContent, ...mockMultipleContents],
          expect.any(Function)
        );
      });
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
