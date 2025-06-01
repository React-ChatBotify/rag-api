import { Request, Response } from 'express';
import { handleGeminiBatch, handleGeminiStream } from '../geminiQuery'; // Updated imports
import { initializedRagService } from '../../services/ragService';
import { generateText } from '../../services/llmWrapper';
import { GeminiChatCompletionResponse, GeminiStreamChunk } from '../../types';

// Mock llmWrapper
jest.mock('../../services/llmWrapper', () => ({
    generateText: jest.fn(),
}));

// Mock initializedRagService (remains the same)
jest.mock('../../services/ragService', () => {
    const mockRagServiceInstance = {
        init: jest.fn().mockResolvedValue(undefined),
        queryChunks: jest.fn(),
    };
    return {
        initializedRagService: Promise.resolve(mockRagServiceInstance),
        RAGService: jest.fn(() => mockRagServiceInstance),
    };
});

const mockRequest = (body: any = {}, params: any = {}): Partial<Request> => ({
    body,
    params,
    on: jest.fn(), // For stream 'close' event if needed by stream handler tests
});

const mockResponse = (): Partial<Response> => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.write = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    res.flushHeaders = jest.fn().mockReturnValue(res); // Added for stream handler
    return res;
};

describe('Gemini RAG Query Controllers', () => {
    let mockRagService: any;
    let mockedGenerateText: jest.Mock;
    const testModel = "gemini-pro-test"; // Example model name

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRagService = await initializedRagService;
        mockedGenerateText = generateText as jest.Mock;
    });

    describe('handleGeminiBatch', () => {
        it('should return 400 if query is missing', async () => {
            const req = mockRequest({}, { model: `${testModel}:generateContent` }) as Request;
            const res = mockResponse() as Response;
            await handleGeminiBatch(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Bad Request: query is required and must be a non-empty string." });
        });

        it('should handle query with no relevant chunks, calling generateText with original query', async () => {
            const req = mockRequest({ query: "test query" }, { model: `${testModel}:generateContent` }) as Request;
            const res = mockResponse() as Response;
            mockRagService.queryChunks.mockResolvedValue([]);
            const mockLLMResponse: GeminiChatCompletionResponse = { // Added index
                candidates: [{ index: 0, content: { parts: [{ text: "LLM response" }], role: "model" }, finishReason: "STOP" }],
            };
            mockedGenerateText.mockResolvedValue(mockLLMResponse);

            await handleGeminiBatch(req, res);

            expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 3); // Default n_results
            expect(mockedGenerateText).toHaveBeenCalledWith({
                query: "test query", // Original query passed as augmentedPrompt
                stream: false,
                model: testModel,
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockLLMResponse);
        });

        it('should handle query with relevant chunks, calling generateText with augmented prompt', async () => {
            const req = mockRequest({ query: "test query", n_results: 2, rag_type: "basic" }, { model: `${testModel}:generateContent` }) as Request;
            const res = mockResponse() as Response;
            const mockChunks = [
                { metadata: { text_chunk: "Chunk 1 text." } },
                { metadata: { text_chunk: "Chunk 2 text." } },
            ];
            mockRagService.queryChunks.mockResolvedValue(mockChunks);
            const mockLLMResponse: GeminiChatCompletionResponse = { // Added index
                candidates: [{ index: 0, content: { parts: [{ text: "LLM response based on context" }], role: "model" }, finishReason: "STOP" }],
            };
            mockedGenerateText.mockResolvedValue(mockLLMResponse);

            await handleGeminiBatch(req, res);

            const expectedContext = "Chunk 1 text.\n---\nChunk 2 text.";
            const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Text Chunks:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

            expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 2);
            expect(mockedGenerateText).toHaveBeenCalledWith({
                query: expectedAugmentedPrompt,
                stream: false,
                model: testModel,
            });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockLLMResponse);
        });
        
        it('should return 503 if RAG service (queryChunks) fails', async () => {
            const req = mockRequest({ query: "test query" }, { model: `${testModel}:generateContent` }) as Request;
            const res = mockResponse() as Response;
            mockRagService.queryChunks.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));

            await handleGeminiBatch(req, res);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith({ error: "Service Unavailable: RAG service is not ready." });
        });
    
        it('should return 500 if llmWrapper.generateText fails', async () => {
            const req = mockRequest({ query: "test query" }, { model: `${testModel}:generateContent` }) as Request;
            const res = mockResponse() as Response;
            mockRagService.queryChunks.mockResolvedValue([]);
            mockedGenerateText.mockRejectedValue(new Error("LLM provider outage"));

            await handleGeminiBatch(req, res);

            expect(mockedGenerateText).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: `Failed to get response from LLM provider Gemini.`, details: "LLM provider outage" });
        });

        describe('handleGeminiBatch - RAG Type Functionality', () => {
            const mockChunksWithAllMetadata = [
                { metadata: { text_chunk: "Chunk 1 text.", original_content: "Parent document 1 content." } },
                { metadata: { text_chunk: "Chunk 2 text.", original_content: "Parent document 2 content." } },
                { metadata: { text_chunk: "Chunk 3 text from doc 1.", original_content: "Parent document 1 content." } },
            ];
             const mockLLMResponse: GeminiChatCompletionResponse = { // Added index
                candidates: [{ index: 0, content: { parts: [{ text: "LLM response" }], role: "model" }, finishReason: "STOP" }],
            };

            it('should default to "basic" RAG if rag_type is not provided', async () => {
                const req = mockRequest({ query: "test query" }, { model: `${testModel}:generateContent` }) as Request;
                const res = mockResponse() as Response;
                mockRagService.queryChunks.mockResolvedValue(mockChunksWithAllMetadata.slice(0, 2));
                mockedGenerateText.mockResolvedValue(mockLLMResponse);
                await handleGeminiBatch(req, res);
                const expectedContext = `${mockChunksWithAllMetadata[0].metadata.text_chunk}\n---\n${mockChunksWithAllMetadata[1].metadata.text_chunk}`;
                const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Text Chunks:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;
                expect(mockedGenerateText).toHaveBeenCalledWith(expect.objectContaining({ query: expectedAugmentedPrompt, model: testModel, stream: false }));
            });

            it('should use "advanced" RAG when rag_type is "advanced"', async () => {
                const req = mockRequest({ query: "test query", rag_type: "advanced" }, { model: `${testModel}:generateContent` }) as Request;
                const res = mockResponse() as Response;
                mockRagService.queryChunks.mockResolvedValue(mockChunksWithAllMetadata);
                mockedGenerateText.mockResolvedValue(mockLLMResponse);
                await handleGeminiBatch(req, res);
                const expectedContext = `${mockChunksWithAllMetadata[0].metadata.original_content}\n---\n${mockChunksWithAllMetadata[1].metadata.original_content}`; // Unique parents
                const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Information from Parent Documents:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;
                expect(mockedGenerateText).toHaveBeenCalledWith(expect.objectContaining({ query: expectedAugmentedPrompt, model: testModel, stream: false }));
            });

            it('should return 400 if rag_type is invalid', async () => {
                const req = mockRequest({ query: "test query", rag_type: "super_advanced" }, { model: `${testModel}:generateContent` }) as Request;
                const res = mockResponse() as Response;
                await handleGeminiBatch(req, res);
                expect(res.status).toHaveBeenCalledWith(400);
                expect(res.json).toHaveBeenCalledWith({ error: "Bad Request: rag_type must be 'basic' or 'advanced'." });
            });
        });
    });

    describe('handleGeminiStream', () => {
        it('should return 400 if query is missing', async () => {
            const req = mockRequest({}, { model: `${testModel}:streamGenerateContent` }) as Request;
            const res = mockResponse() as Response;
            await handleGeminiStream(req, res);
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: "Bad Request: query is required and must be a non-empty string." });
        });

        it('should set up SSE headers and stream responses', async () => {
            const req = mockRequest({ query: "test query stream" }, { model: `${testModel}:streamGenerateContent` }) as Request;
            const res = mockResponse() as Response;
            mockRagService.queryChunks.mockResolvedValue([]);

            const streamChunk1: GeminiStreamChunk = { candidates: [{ index:0, content: { parts: [{ text: "Stream chunk 1" }], role: "model" }, finishReason: "SAFETY" }] }; // Added index
            const streamChunk2: GeminiStreamChunk = { candidates: [{ index:0, content: { parts: [{ text: "Stream chunk 2" }], role: "model" }, finishReason: "STOP" }] }; // Added index

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
            expect(res.flushHeaders).toHaveBeenCalled();

            expect(mockedGenerateText).toHaveBeenCalledWith({
                query: "test query stream",
                stream: true,
                model: testModel,
                onChunk: expect.any(Function)
            });

            expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify(streamChunk1)}\n\n`);
            expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify(streamChunk2)}\n\n`);
            expect(res.end).toHaveBeenCalled();
        });

        it('should handle error from generateText by writing to stream if headers sent', async () => {
            const req = mockRequest({ query: "test query stream" }, { model: `${testModel}:streamGenerateContent` }) as Request;
            const res = mockResponse() as Response;
            mockRagService.queryChunks.mockResolvedValue([]);
            mockedGenerateText.mockRejectedValue(new Error("LLM stream error"));

            await handleGeminiStream(req, res);

            expect(res.flushHeaders).toHaveBeenCalled();
            expect(mockedGenerateText).toHaveBeenCalled();
            expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ error: "Failed to get response from LLM provider Gemini.", details: "LLM stream error" })}\n\n`);
            expect(res.end).toHaveBeenCalled();
        });

        it('should handle RAG service error by writing to stream if headers sent', async () => {
            const req = mockRequest({ query: "test query" }, { model: `${testModel}:streamGenerateContent` }) as Request;
            const res = mockResponse() as Response;

            mockRagService.queryChunks.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));
            // Simulate headers already sent for this specific test case of stream error
            (res as any).headersSent = true;


            await handleGeminiStream(req, res);

            expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ error: "Service Unavailable: RAG service is not ready.", details: "ChromaDB collection is not initialized." })}\n\n`);
            expect(res.end).toHaveBeenCalled();
        });

        it('handleGeminiStream - should use "basic" RAG with augmented prompt', async () => {
            const req = mockRequest({ query: "test query", rag_type: "basic" }, { model: `${testModel}:streamGenerateContent` }) as Request;
            const res = mockResponse() as Response;
            const mockChunks = [{ metadata: { text_chunk: "Stream chunk context." } }];
            mockRagService.queryChunks.mockResolvedValue(mockChunks);

            mockedGenerateText.mockImplementation(async (options) => { /* do nothing */ });

            await handleGeminiStream(req, res);

            const expectedContext = "Stream chunk context.";
            const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Text Chunks:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

            expect(mockedGenerateText).toHaveBeenCalledWith(expect.objectContaining({
                query: expectedAugmentedPrompt,
                stream: true,
                model: testModel,
            }));
            expect(res.end).toHaveBeenCalled();
        });

        it('should return SSE error if rag_type is invalid after headers sent', async () => {
            const req = mockRequest({ query: "test query", rag_type: "super_advanced" }, { model: `${testModel}:streamGenerateContent` }) as Request;
            const res = mockResponse() as Response;
            await handleGeminiStream(req, res);
            expect(res.flushHeaders).toHaveBeenCalled();
            expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ error: "Bad Request: rag_type must be 'basic' or 'advanced'." })}\n\n`);
            expect(res.end).toHaveBeenCalled();
        });
    });
});
