import { Request, Response } from 'express';

// Import config to allow spying on it, but it will be mocked
import * as configModule from '../../config';
// Import the actual config to spy on its properties.
// The module 'src/config' is mocked above, so direct import of 'config' object
// from '../../config' would give the mocked version.
// To spy on the actual config object that the controller uses (which is the mocked one in tests),
// we use configModule.config.
import Logger from '../../logger'; // Import Logger to mock its methods
import { generateText } from '../../services/llmWrapper';
import { initializedRagService } from '../../services/ragService';
import { GeminiChatCompletionResponse, GeminiContent } from '../../types'; // Added GeminiContent
import { handleGeminiBatch, handleGeminiStream } from '../geminiQuery';

// Mock src/config - This is the one that will be used by the controllers
jest.mock('../../config', () => ({
  config: {
    MONGODB_DATABASE_NAME: 'test-db',
    MONGODB_URI: 'mongodb://test-host:27017/test-db',
    chromaPort: '8000',
    chromaUrl: 'http://localhost',
    geminiApiKey: 'test-api-key',
    geminiChatModel: 'gemini-pro',
    geminiEmbeddingModel: 'text-embedding-004',
    geminiNResults: 3,
    geminiRagType: 'basic',
    ragConversationWindowSize: 0, // Default to 0 for window size unless overridden by spy
    geminiSystemPrompt: 'System prompt from config', // Add other potentially accessed configs
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

// Mock Logger
jest.mock('../../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const mockSingleContentItem: GeminiContent[] = [{ parts: [{ text: 'test query' }], role: 'user' }];
const mockFiveMessageHistory: GeminiContent[] = [
  { parts: [{ text: 'Message 1' }], role: 'user' },
  { parts: [{ text: 'Message 2' }], role: 'model' },
  { parts: [{ text: 'Message 3' }], role: 'user' },
  { parts: [{ text: 'Message 4' }], role: 'model' },
  { parts: [{ text: 'Message 5 (latest)' }], role: 'user' },
];

const mockRequest = (
  body: any = { contents: mockSingleContentItem },
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
  (res as any).headersSent = false; // Initialize headersSent
  return res;
};

// Helper function to build expected userQueryForRAG string
const buildExpectedUserQueryForRAG = (messages: GeminiContent[]): string => {
  return messages.flatMap((contentItem) => contentItem.parts.map((part) => part.text)).join('\n');
};

describe('Gemini RAG Query Controllers', () => {
  let mockRagService: any;
  let mockedGenerateText: jest.Mock;
  let configSpy: jest.SpyInstance | undefined; // To spy on config.ragConversationWindowSize
  let loggerInfoSpy: jest.SpyInstance = jest.spyOn(Logger, 'info');
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
  
  describe('RAG Conversation Windowing (Batch)', () => {
    beforeEach(() => {
        mockRagService.queryChunks.mockResolvedValue([]); // Default: no RAG context for simplicity
        mockedGenerateText.mockResolvedValue({ candidates: [] } as GeminiChatCompletionResponse);
      });

    it('should use window size from config if smaller than history', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(2);
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiBatch(req, res);

      const expectedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory.slice(-2));
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('RAG windowing: Using last 2 of 5 messages'));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(expectedQuery, expect.any(Number));
      expect(mockedGenerateText).toHaveBeenCalledWith(expect.objectContaining({ contents: mockFiveMessageHistory }));
    });

    it('should use all messages if window size is larger than history', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(10);
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiBatch(req, res);

      const expectedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory);
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Window size 10 is >= total messages 5. Using all messages'));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(expectedQuery, expect.any(Number));
    });

    it('should use all messages if window size is 0', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(0);
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiBatch(req, res);

      const expectedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory);
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Window size is 0 or not set. Using all 5 messages'));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(expectedQuery, expect.any(Number));
    });
    
    it('should use all messages if window size is negative (handled by config load to default to 0)', async () => {
      // The config loading logic defaults negative numbers to 0.
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(0); 
      
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiBatch(req, res);

      const expectedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory);
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Window size is 0 or not set. Using all 5 messages'));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(expectedQuery, expect.any(Number));
    });

    it('should correctly form userQueryForRAG with RAG context and windowing', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(2);
      const mockChunks = [{ metadata: { text_chunk: 'RAG Window Chunk' } }];
      mockRagService.queryChunks.mockResolvedValue(mockChunks);
      
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiBatch(req, res);

      const windowedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory.slice(-2));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(windowedQuery, expect.any(Number));
      // Ensure the full history is still used for augmenting the LLM call itself
      const generateTextCall = mockedGenerateText.mock.calls[0][0];
      expect(generateTextCall.contents.length).toBe(mockFiveMessageHistory.length);
      const lastMessageText = generateTextCall.contents[generateTextCall.contents.length -1].parts[0].text;
      expect(lastMessageText).toContain('RAG Window Chunk'); // Check RAG context
      expect(lastMessageText).toContain(mockFiveMessageHistory[mockFiveMessageHistory.length-1].parts[0].text); // Check original last message part
    });
  });

  describe('handleGeminiStream', () => {
    describe('Input Validation', () => {
      const invalidBodyTestCases = [
        { body: {}, description: 'empty body' },
        { body: { contents: null }, description: 'contents is null' },
        { body: { contents: [] }, description: 'contents is empty array' },
        { body: { contents: [{ parts: [{ text: '' }] }] }, description: 'contents[0].parts[0].text is empty string' },
      ];

      invalidBodyTestCases.forEach(({ body, description }) => {
        it(`should return 400 (JSON) if ${description} and headers not sent`, async () => {
          const req = mockRequest(body, { model: testModel }) as Request;
          const res = mockResponse() as Response;
          (res as any).headersSent = false; 
          await handleGeminiStream(req, res);
          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledWith({ error: 'Bad Request: contents is required and must be an array of content items, each with at least one part containing a non-empty text string.' });
          expect(res.flushHeaders).not.toHaveBeenCalled();
        });

        it(`should write error to stream if ${description} and headers already sent`, async () => {
          const req = mockRequest(body, { model: testModel }) as Request;
          const res = mockResponse() as Response;
          (res as any).headersSent = true; 
          (res.flushHeaders as jest.Mock).mockImplementation(() => { (res as any).headersSent = true; });
          await handleGeminiStream(req, res);
          expect(res.status).not.toHaveBeenCalledWith(400); 
          expect(res.json).not.toHaveBeenCalled(); 
          expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ error: 'Bad Request: contents is required and must be an array of content items, each with at least one part containing a non-empty text string.' })}\n\n`);
          expect(res.end).toHaveBeenCalled();
        });
      });
       // Test for the empty consolidated query error in stream
      it('should write empty consolidated query error to stream if headers already sent', async () => {
        const req = mockRequest({ contents: [{parts: [{text: "   "}]}] }, { model: testModel }) as Request;
        const res = mockResponse() as Response;
        (res.flushHeaders as jest.Mock).mockImplementation(() => { (res as any).headersSent = true; });
        
        await handleGeminiStream(req, res);
        expect(res.flushHeaders).toHaveBeenCalled();
        expect((res as any).headersSent).toBe(true);
        expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ error: 'Bad Request: Consolidated text from contents is empty.' })}\n\n`);
        expect(res.end).toHaveBeenCalled();
      });
    });

    it('should set up SSE headers and stream responses (using config defaults)', async () => {
      const req = mockRequest(undefined, { model: testModel }) as Request; // default mockSingleContentItem
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockResolvedValue([]); 
      const streamChunk1Sse = 'data: {"text":"Chunk 1"}\n\n';
      mockedGenerateText.mockImplementation(async (options: {onChunk?: (rawSseLine: string) => void}) => {
        if (options.onChunk) {
          options.onChunk(streamChunk1Sse.trim());
        }
      });
      await handleGeminiStream(req, res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(res.flushHeaders).toHaveBeenCalled(); 
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(defaultQuery, 3); 
      expect(mockedGenerateText).toHaveBeenCalledWith({
        model: testModel,
        onChunk: expect.any(Function),
        contents: mockSingleContentItem, 
        stream: true,
      });
      expect(res.write).toHaveBeenCalledWith(`${streamChunk1Sse.trim()}\n`);
      expect(res.end).toHaveBeenCalled();
    });

    it('should use custom rag_type and n_results from config for stream', async () => {
      const originalRagType = configModule.config.geminiRagType;
      const originalNResults = configModule.config.geminiNResults;
      configModule.config.geminiNResults = 2;
      configModule.config.geminiRagType = 'advanced';
      const req = mockRequest(undefined, { model: testModel }) as Request; // default mockSingleContentItem
      const res = mockResponse() as Response;
      const mockChunks = [{ metadata: { original_content: 'Advanced stream context.' } }];
      mockRagService.queryChunks.mockResolvedValue(mockChunks);
      mockedGenerateText.mockImplementation(async () => {});
      await handleGeminiStream(req, res);
      const expectedContext = 'Advanced stream context.';
      const ragAugmentationPrefix = `Based on the relevant information below, answer the user query.\nRelevant Information from Parent Documents:\n---\n${expectedContext}\n---\nConsidering the above context and the conversation history, here is the latest user message: `;
      const expectedContentsForLlm: GeminiContent[] = JSON.parse(JSON.stringify(mockSingleContentItem));
      expectedContentsForLlm[0].parts[0].text = ragAugmentationPrefix + mockSingleContentItem[0].parts[0].text;
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(defaultQuery, 2); 
      expect(mockedGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expectedContentsForLlm,
          stream: true,
        })
      );
      configModule.config.geminiNResults = originalNResults;
      configModule.config.geminiRagType = originalRagType; 
    });

    it('should handle error from generateText by writing to stream if headers sent', async () => {
      const req = mockRequest(undefined, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockResolvedValue([]);
      mockedGenerateText.mockRejectedValue(new Error('LLM stream error'));
      (res.flushHeaders as jest.Mock).mockImplementation(() => { (res as any).headersSent = true; });
      await handleGeminiStream(req, res);
      expect(res.flushHeaders).toHaveBeenCalled(); 
      expect((res as any).headersSent).toBe(true);
      expect(mockedGenerateText).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify({ details: 'LLM stream error', error: 'Failed to get response from LLM provider Gemini.' })}\n\n`
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle RAG service error by writing to stream if headers sent', async () => {
      const req = mockRequest(undefined, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      mockRagService.queryChunks.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));
      (res.flushHeaders as jest.Mock).mockImplementation(() => { (res as any).headersSent = true; });
      await handleGeminiStream(req, res);
      expect(res.flushHeaders).toHaveBeenCalled(); 
      expect((res as any).headersSent).toBe(true);
      expect(res.write).toHaveBeenCalledWith(
        `data: ${JSON.stringify({ details: 'ChromaDB collection is not initialized.', error: 'Service Unavailable: RAG service is not ready.' })}\n\n`
      );
      expect(res.end).toHaveBeenCalled();
    });
  });
  
  describe('RAG Conversation Windowing (Stream)', () => {
    beforeEach(() => {
        mockRagService.queryChunks.mockResolvedValue([]); 
        mockedGenerateText.mockImplementation(async (options) => {
          if (options.onChunk) options.onChunk('data: {}\n\n'); // Send a generic SSE message
          return Promise.resolve();
        });
      });

    it('should use window size from config if smaller than history (stream)', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(2);
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiStream(req, res);

      const expectedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory.slice(-2));
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('RAG windowing: Using last 2 of 5 messages for RAG query (stream).'));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(expectedQuery, expect.any(Number));
      expect(mockedGenerateText).toHaveBeenCalledWith(expect.objectContaining({ contents: mockFiveMessageHistory }));
    });

    it('should use all messages if window size is larger than history (stream)', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(10);
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiStream(req, res);

      const expectedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory);
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Window size 10 is >= total messages 5. Using all messages for RAG query (stream).'));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(expectedQuery, expect.any(Number));
    });

    it('should use all messages if window size is 0 (stream)', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(0);
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiStream(req, res);

      const expectedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory);
      expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Window size is 0 or not set. Using all 5 messages for RAG query (stream).'));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(expectedQuery, expect.any(Number));
    });

    it('should correctly form userQueryForRAG with RAG context and windowing (stream)', async () => {
      configSpy = jest.spyOn(configModule.config, 'ragConversationWindowSize', 'get').mockReturnValue(2);
      const mockChunks = [{ metadata: { text_chunk: 'RAG Stream Window Chunk' } }];
      mockRagService.queryChunks.mockResolvedValue(mockChunks);
      
      const req = mockRequest({ contents: mockFiveMessageHistory }, { model: testModel }) as Request;
      const res = mockResponse() as Response;
      await handleGeminiStream(req, res);

      const windowedQuery = buildExpectedUserQueryForRAG(mockFiveMessageHistory.slice(-2));
      expect(mockRagService.queryChunks).toHaveBeenCalledWith(windowedQuery, expect.any(Number));
      
      const generateTextCall = mockedGenerateText.mock.calls[0][0];
      expect(generateTextCall.contents.length).toBe(mockFiveMessageHistory.length); // Full history to LLM
      const lastMessageText = generateTextCall.contents[generateTextCall.contents.length -1].parts[0].text;
      expect(lastMessageText).toContain('RAG Stream Window Chunk'); // RAG context
      expect(lastMessageText).toContain(mockFiveMessageHistory[mockFiveMessageHistory.length-1].parts[0].text); // Original last message
    });
  });
});
