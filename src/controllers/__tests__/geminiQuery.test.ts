import { Request, Response } from 'express';

// Import config to allow spying on it, but it will be mocked
import * as configModule from '../../config';
import { generateText } from '../../services/llmWrapper';
import { initializedRagService } from '../../services/ragService';
import { GeminiChatCompletionResponse, GeminiStreamChunk } from '../../types';
import { handleGeminiBatch, handleGeminiStream } from '../geminiQuery';

// Mock src/config
// We mock the actual module 'src/config'
jest.mock('../../config', () => ({
  config: {
    // Default for most tests
    // Add other necessary config properties if your controller uses them
    MONGODB_DATABASE_NAME: 'test-db',

    MONGODB_URI: 'mongodb://test-host:27017/test-db',

    chromaPort: '8000',

    geminiApiKey: 'test-api-key',

    geminiChatModel: 'gemini-pro',

    chromaUrl: 'http://localhost',

    // Default mock, can be overridden per test
    geminiEmbeddingModel: 'text-embedding-004',
    // Default for most tests
    geminiNResults: 3,
    geminiRagType: 'basic',
    port: 8080,
    ragApiKey: 'test-rag-api-key',
    ragQueryApiKey: 'test-rag-query-api-key',
  },
}));

// Mock llmWrapper
jest.mock('../../services/llmWrapper', () => ({
  generateText: jest.fn(),
}));

// Mock initializedRagService
jest.mock('../../services/ragService', () => {
  const mockRagServiceInstance = {
    init: jest.fn().mockResolvedValue(undefined),
    queryChunks: jest.fn(),
  };
  return {
    RAGService: jest.fn(() => mockRagServiceInstance),
    initializedRagService: Promise.resolve(mockRagServiceInstance),
  };
});

const mockRequest = (
  body: any = { contents: [{ parts: [{ text: 'test query' }] }] },
  params: any = {}
): Partial<Request> => ({
  body,
  on: jest.fn(),
  params,
});

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.write = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.flushHeaders = jest.fn().mockReturnValue(res);
  return res;
};

describe('Gemini RAG Query Controllers', () => {
  let mockRagService: any;
  let mockedGenerateText: jest.Mock;
  const testModel = 'gemini-pro-test';
  const defaultQuery = 'test query';
  const defaultRequestBody = { contents: [{ parts: [{ text: defaultQuery }] }] };
  const errorResponse =
    'Bad Request: contents is required and must be an array with at least one part containing a non-empty text string.';

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset to default mock config before each test if necessary,
    // especially if using jest.doMock or jest.spyOn for specific test config overrides.
    // For this setup, the top-level jest.mock should suffice for defaults.
    mockRagService = await initializedRagService;
    mockedGenerateText = generateText as jest.Mock;
  });

  describe('handleGeminiBatch', () => {
    describe('Input Validation', () => {
      const invalidBodyTestCases = [
        { body: {}, description: 'empty body' },
        { body: { contents: null }, description: 'contents is null' },
        { body: { contents: [] }, description: 'contents is empty array' },
        { body: { contents: [{}] }, description: 'contents[0] is empty object' },
        { body: { contents: [{ parts: null }] }, description: 'contents[0].parts is null' },
        { body: { contents: [{ parts: [] }] }, description: 'contents[0].parts is empty array' },
        { body: { contents: [{ parts: [{}] }] }, description: 'contents[0].parts[0] is empty object' },
        { body: { contents: [{ parts: [{ text: null }] }] }, description: 'contents[0].parts[0].text is null' },
        { body: { contents: [{ parts: [{ text: '' }] }] }, description: 'contents[0].parts[0].text is empty string' },
        {
          body: { contents: [{ parts: [{ text: '   ' }] }] },
          description: 'contents[0].parts[0].text is whitespace string',
        },
      ];

      invalidBodyTestCases.forEach(({ body, description }) => {
        it(`should return 400 if ${description}`, async () => {
          const req = mockRequest(body, { model: `${testModel}:generateContent` }) as Request;
          const res = mockResponse() as Response;
          await handleGeminiBatch(req, res);
          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({ error: errorResponse });
        });
      });
    });

    it('should handle query with no relevant chunks, calling generateText with original query and config defaults', async () => {
      const req = mockRequest(defaultRequestBody, { model: `${testModel}:generateContent` }) as Request;
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockResolvedValue([]);
      const mockLLMResponse: GeminiChatCompletionResponse = {
        candidates: [{ content: { parts: [{ text: 'LLM response' }], role: 'model' }, finishReason: 'STOP', index: 0 }],
      };
      mockedGenerateText.mockResolvedValue(mockLLMResponse);

      await handleGeminiBatch(req, res);

      expect(mockRagService.queryChunks).toHaveBeenCalledWith(defaultQuery, 3); // Default n_results from mock
      expect(mockedGenerateText).toHaveBeenCalledWith({
        model: testModel,
        query: defaultQuery,
        stream: false,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockLLMResponse);
    });

    it('should use custom rag_type and n_results from config', async () => {
      // Temporarily change config for this test
      const originalConfig = configModule.config;
      (configModule.config as any) = {
        ...originalConfig,
        geminiNResults: 5,
        geminiRagType: 'advanced',
      };

      const req = mockRequest(defaultRequestBody, { model: `${testModel}:generateContent` }) as Request;
      const res = mockResponse() as Response;
      const mockChunks = [
        { metadata: { original_content: 'Advanced chunk 1.' } },
        { metadata: { original_content: 'Advanced chunk 2.' } },
      ];
      mockRagService.queryChunks.mockResolvedValue(mockChunks);
      const mockLLMResponse: GeminiChatCompletionResponse = {
        candidates: [{ content: { parts: [{ text: 'LLM response' }], role: 'model' }, finishReason: 'STOP', index: 0 }],
      };
      mockedGenerateText.mockResolvedValue(mockLLMResponse);

      await handleGeminiBatch(req, res);

      const expectedContext = 'Advanced chunk 1.\n---\nAdvanced chunk 2.';
      const expectedAugmentedPrompt = `User Query: ${defaultQuery}\n\nRelevant Information from Parent Documents:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

      expect(mockRagService.queryChunks).toHaveBeenCalledWith(defaultQuery, 5); // Custom n_results
      expect(mockedGenerateText).toHaveBeenCalledWith({
        model: testModel,
        query: expectedAugmentedPrompt,
        stream: false,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockLLMResponse);

      // Restore original config
      (configModule.config as any) = originalConfig;
    });

    it('should handle query with relevant chunks (basic RAG from config), calling generateText with augmented prompt', async () => {
      // Ensure config is default 'basic' and 3 results for this test
      const originalConfig = configModule.config;
      (configModule.config as any) = { ...originalConfig, geminiNResults: 3, geminiRagType: 'basic' };

      const req = mockRequest(defaultRequestBody, { model: `${testModel}:generateContent` }) as Request;
      const res = mockResponse() as Response;
      const mockChunks = [{ metadata: { text_chunk: 'Chunk 1 text.' } }, { metadata: { text_chunk: 'Chunk 2 text.' } }];
      mockRagService.queryChunks.mockResolvedValue(mockChunks);
      const mockLLMResponse: GeminiChatCompletionResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'LLM response based on context' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      };
      mockedGenerateText.mockResolvedValue(mockLLMResponse);

      await handleGeminiBatch(req, res);

      const expectedContext = 'Chunk 1 text.\n---\nChunk 2 text.';
      const expectedAugmentedPrompt = `User Query: ${defaultQuery}\n\nRelevant Text Chunks:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

      expect(mockRagService.queryChunks).toHaveBeenCalledWith(defaultQuery, 3); // Default from config
      expect(mockedGenerateText).toHaveBeenCalledWith({
        model: testModel,
        query: expectedAugmentedPrompt,
        stream: false,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockLLMResponse);
      (configModule.config as any) = originalConfig; // Restore
    });

    it('should return 503 if RAG service (queryChunks) fails', async () => {
      const req = mockRequest(defaultRequestBody, { model: `${testModel}:generateContent` }) as Request;
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));

      await handleGeminiBatch(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service Unavailable: RAG service is not ready.' });
    });

    it('should return 500 if llmWrapper.generateText fails', async () => {
      const req = mockRequest(defaultRequestBody, { model: `${testModel}:generateContent` }) as Request;
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockResolvedValue([]);
      mockedGenerateText.mockRejectedValue(new Error('LLM provider outage'));

      await handleGeminiBatch(req, res);

      expect(mockedGenerateText).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        details: 'LLM provider outage',
        error: `Failed to get response from LLM provider Gemini.`,
      });
    });
  });

  describe('handleGeminiStream', () => {
    describe('Input Validation', () => {
      const invalidBodyTestCases = [
        { body: {}, description: 'empty body' },
        { body: { contents: null }, description: 'contents is null' },
        { body: { contents: [] }, description: 'contents is empty array' },
        // ... (add other invalid cases as in handleGeminiBatch)
        { body: { contents: [{ parts: [{ text: '' }] }] }, description: 'contents[0].parts[0].text is empty string' },
      ];

      invalidBodyTestCases.forEach(({ body, description }) => {
        it(`should return 400 (JSON) if ${description} and headers not sent`, async () => {
          const req = mockRequest(body, { model: `${testModel}:streamGenerateContent` }) as Request;
          const res = mockResponse() as Response;
          (res as any).headersSent = false; // Explicitly set for clarity

          await handleGeminiStream(req, res);

          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({ error: errorResponse });
          expect(res.flushHeaders).not.toHaveBeenCalled();
        });

        it(`should write error to stream if ${description} and headers already sent`, async () => {
          const req = mockRequest(body, { model: `${testModel}:streamGenerateContent` }) as Request;
          const res = mockResponse() as Response;
          (res as any).headersSent = true; // Simulate headers already sent
          // Mock flushHeaders to not throw if called before error detection in some code paths
          (res.flushHeaders as jest.Mock).mockImplementation(() => {
            (res as any).headersSent = true;
          });

          await handleGeminiStream(req, res);

          expect(res.status).not.toHaveBeenCalledWith(400); // Should not set status
          expect(res.json).not.toHaveBeenCalled(); // Should not send JSON
          expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ error: errorResponse })}\n\n`);
          expect(res.end).toHaveBeenCalled();
        });
      });
    });

    it('should set up SSE headers and stream responses (using config defaults)', async () => {
      const req = mockRequest(defaultRequestBody, { model: `${testModel}:streamGenerateContent` }) as Request;
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockResolvedValue([]); // No RAG context

      const streamChunk1: GeminiStreamChunk = {
        candidates: [{ content: { parts: [{ text: 'Stream chunk 1' }], role: 'model' }, index: 0 }],
      };
      const streamChunk2: GeminiStreamChunk = {
        candidates: [{ content: { parts: [{ text: 'Stream chunk 2' }], role: 'model' }, index: 0 }],
      };

      mockedGenerateText.mockImplementation(async (options) => {
        if (options.onChunk) {
          options.onChunk(streamChunk1);
          options.onChunk(streamChunk2);
        }
      });

      await handleGeminiStream(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled(); // Called after validation

      expect(mockRagService.queryChunks).toHaveBeenCalledWith(defaultQuery, 3); // Default n_results
      expect(mockedGenerateText).toHaveBeenCalledWith({
        model: testModel,
        onChunk: expect.any(Function),
        query: defaultQuery, // No RAG context
        stream: true,
      });

      expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify(streamChunk1)}\n\n`);
      expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify(streamChunk2)}\n\n`);
      expect(res.end).toHaveBeenCalled();
    });

    it('should use custom rag_type and n_results from config for stream', async () => {
      const originalConfig = configModule.config;
      (configModule.config as any) = {
        ...originalConfig,
        geminiNResults: 2,
        geminiRagType: 'advanced',
      };

      const req = mockRequest(defaultRequestBody, { model: `${testModel}:streamGenerateContent` }) as Request;
      const res = mockResponse() as Response;
      const mockChunks = [{ metadata: { original_content: 'Advanced stream context.' } }];
      mockRagService.queryChunks.mockResolvedValue(mockChunks);
      mockedGenerateText.mockImplementation(async () => {});

      await handleGeminiStream(req, res);

      const expectedContext = 'Advanced stream context.';
      const expectedAugmentedPrompt = `User Query: ${defaultQuery}\n\nRelevant Information from Parent Documents:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

      expect(mockRagService.queryChunks).toHaveBeenCalledWith(defaultQuery, 2); // Custom from config
      expect(mockedGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expectedAugmentedPrompt,
          stream: true,
        })
      );
      (configModule.config as any) = originalConfig; // Restore
    });

    it('should handle error from generateText by writing to stream if headers sent', async () => {
      const req = mockRequest(defaultRequestBody, { model: `${testModel}:streamGenerateContent` }) as Request;
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockResolvedValue([]);
      mockedGenerateText.mockRejectedValue(new Error('LLM stream error'));

      await handleGeminiStream(req, res);

      expect(res.flushHeaders).toHaveBeenCalled(); // Called after validation
      expect(mockedGenerateText).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify({ details: 'LLM stream error', error: 'Failed to get response from LLM provider Gemini.' })}\n\n`
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle RAG service error by writing to stream if headers sent', async () => {
      const req = mockRequest(defaultRequestBody, { model: `${testModel}:streamGenerateContent` }) as Request;
      const res = mockResponse() as Response;

      mockRagService.queryChunks.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));
      // Simulate headers already sent for this specific test case of stream error
      // For this to work as intended, flushHeaders must be called before queryChunks
      (res.flushHeaders as jest.Mock).mockImplementation(() => {
        (res as any).headersSent = true;
      });

      await handleGeminiStream(req, res);
      expect(res.flushHeaders).toHaveBeenCalled(); // Ensure it was called
      expect((res as any).headersSent).toBe(true); // Verify assumption

      expect(res.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify({ details: 'ChromaDB collection is not initialized.', error: 'Service Unavailable: RAG service is not ready.' })}\n\n`
      );
      expect(res.end).toHaveBeenCalled();
    });
  });
});
