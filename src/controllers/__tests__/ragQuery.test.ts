import { Request, Response } from 'express';
import { handleRagQuery } from '../ragQuery'; // Adjust path as needed
import { initializedRagService } from '../../services/ragService';
import { config } from '../../config';

// Mock the initializedRagService
jest.mock('../../services/ragService', () => ({
    initializedRagService: Promise.resolve({
        queryChunks: jest.fn(),
        // getParentDocumentContent: jest.fn(), // Not directly called by ragQuery, context is from queryChunks' metadata
    })
}));

// Mock config (specifically for LLM API keys and base URLs if used by a real fetch)
jest.mock('../../config', () => ({
    config: {
        openaiApiKey: 'test-openai-key',
        openaiBaseUrl: 'https://api.openai.com/v1',
        geminiApiKey: 'test-gemini-key',
        geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        // other config values
    },
}));

// Mock 'node-fetch' or any HTTP client used for actual LLM calls
// Since the controller currently simulates fetch, we don't need to mock node-fetch itself,
// but rather ensure our tests cover the simulated logic.
// If it were using a real fetch, we'd do:
// jest.mock('node-fetch', () => jest.fn());

const mockRequest = (body: any = {}): Partial<Request> => ({
    body,
    on: jest.fn(), // Add mock for 'on' method
});

const mockResponse = (): Partial<Response> => {
    const res: Partial<Response> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.write = jest.fn().mockReturnValue(res);
    res.end = jest.fn().mockReturnValue(res);
    return res;
};

describe('RAG Query Controller (handleRagQuery)', () => {
    let mockRagService: any;
    // let mockFetch: jest.Mock; // If using actual fetch

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRagService = await initializedRagService;
        // mockFetch = fetch as jest.Mock; // If using actual fetch
    });

    it('should return 400 if query is missing', async () => {
        const req = mockRequest({}) as Request;
        const res = mockResponse() as Response;
        await handleRagQuery(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Bad Request: query is required and must be a non-empty string." });
    });

    it('should handle query with no relevant chunks (simulated LLM call)', async () => {
        const req = mockRequest({ query: "test query", stream: false }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]); // No chunks found

        await handleRagQuery(req, res);

        // As the LLM call is simulated, we check for the simulated response structure
        expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 3); // Default n_results
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gpt-3.5-turbo', // Default model
            choices: expect.arrayContaining([
                expect.objectContaining({
                    message: expect.objectContaining({
                        content: expect.stringContaining("Simulated response for query: test query with context.")
                    })
                })
            ])
        }));
        // Check that the prompt sent to LLM (in simulation) did not contain "Relevant Information"
        const responseJson = (res.json as jest.Mock).mock.calls[0][0];
        expect(responseJson.choices[0].message.content).not.toContain("Relevant Information:");
    });

    it('should handle query with relevant chunks (simulated LLM call)', async () => {
        const req = mockRequest({ query: "test query", n_results: 2, llm_model: "gpt-4", stream: false }) as Request;
        const res = mockResponse() as Response;
        const mockChunks = [
            { id: 'c1', metadata: { original_content: "Content for doc1" }, document: "Chunk 1 text" },
            { id: 'c2', metadata: { original_content: "Content for doc2" }, document: "Chunk 2 text" },
        ];
        mockRagService.queryChunks.mockResolvedValue(mockChunks);

        await handleRagQuery(req, res);
        
        expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 2);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gpt-4',
            choices: expect.arrayContaining([
                expect.objectContaining({
                    message: expect.objectContaining({
                        content: expect.stringContaining("Simulated response for query: test query with context.")
                    })
                })
            ])
        }));
        // Check that the prompt sent to LLM (in simulation) DID contain "Relevant Information"
        const responseJson = (res.json as jest.Mock).mock.calls[0][0];
        // The actual augmented prompt in the controller uses \n directly.
        const expectedPromptPart = `User Query: test query

Relevant Information:
---
Content for doc1
---
Content for doc2
---
Based on the relevant information above, answer the user query.`;
        expect(responseJson.choices[0].message.content).toContain(expectedPromptPart);
    });
    
    it('should handle query with relevant chunks but no original_content (simulated LLM call)', async () => {
        const req = mockRequest({ query: "test query", stream: false }) as Request;
        const res = mockResponse() as Response;
        const mockChunks = [ // Chunks are found, but original_content is missing
            { id: 'c1', metadata: { /* no original_content */ }, document: "Chunk 1 text" },
        ];
        mockRagService.queryChunks.mockResolvedValue(mockChunks);

        await handleRagQuery(req, res);
        
        expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 3);
        expect(res.status).toHaveBeenCalledWith(200);
        const responseJson = (res.json as jest.Mock).mock.calls[0][0];
        // Prompt should be the original query as no context could be built
        expect(responseJson.choices[0].message.content).toContain("Simulated response for query: test query with context. Model: gpt-3.5-turbo. Prompt: test query");
        expect(responseJson.choices[0].message.content).not.toContain("Relevant Information:");
    });


    it('should handle simulated streaming response', async () => {
        jest.useFakeTimers(); // Use Jest's fake timers

        const req = mockRequest({ query: "test query stream", stream: true }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]); // No chunks, direct to LLM

        // Call handleRagQuery, but don't await it directly if it doesn't return a promise
        // that resolves only after the stream is fully done.
        // The current `handleRagQuery` for streaming doesn't return a promise that signals full completion.
        handleRagQuery(req, res); 

        // Advance timers to ensure setTimeout in the controller executes
        jest.runAllTimers();

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
        expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');

        expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ "choices": [{ "delta": { "content": `Simulated stream response for query: test query stream with context.` } }] })}\n\n`);
        expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ "choices": [{ "delta": { "content": ` More simulated content.` } }] })}\n\n`);
        expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify("[DONE]")}\n\n`);
        expect(res.end).toHaveBeenCalled();
        
        jest.useRealTimers(); // Restore real timers
    });

    it('should return 503 if RAG service (queryChunks) fails with ChromaDB not initialized', async () => {
        const req = mockRequest({ query: "test query" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));
        
        await handleRagQuery(req, res);
        
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ error: "Service Unavailable: RAG service is not ready." });
    });
    
    it('should return 503 if RAG service (queryChunks) fails with Embedding model not ready', async () => {
        const req = mockRequest({ query: "test query" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockRejectedValue(new Error('Failed to initialize embedding pipeline'));
        
        await handleRagQuery(req, res);
        
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ error: "Service Unavailable: Embedding model not ready." });
    });

    it('should return 500 for other RAG service errors', async () => {
        const req = mockRequest({ query: "test query" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockRejectedValue(new Error('Some other RAG error'));
        
        await handleRagQuery(req, res);
        
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Internal Server Error", details: 'Some other RAG error' });
    });

    it('should return 400 for unsupported LLM model', async () => {
        const req = mockRequest({ query: "test query", llm_model: "unsupported-model" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]); // To proceed to LLM selection

        await handleRagQuery(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Unsupported LLM model: unsupported-model. Currently supports 'gpt-' prefixed models." });
    });
    
    it('should return 501 for Gemini model as it is not fully implemented', async () => {
        const req = mockRequest({ query: "test query", llm_model: "gemini-pro" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]);

        await handleRagQuery(req, res);

        expect(res.status).toHaveBeenCalledWith(501);
        expect(res.json).toHaveBeenCalledWith({ error: "Gemini model integration is not fully implemented in this RAG query path yet." });
    });

    it('should return 500 if API key for selected model is not configured', async () => {
        const req = mockRequest({ query: "test query", llm_model: "gpt-custom" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]);
        
        // Temporarily break config for openaiApiKey to test this path
        const originalOpenaiApiKey = config.openaiApiKey;
        (config as any).openaiApiKey = undefined; 

        await handleRagQuery(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "API key for gpt-custom is not configured." });
        
        (config as any).openaiApiKey = originalOpenaiApiKey; // Restore
    });

    // Note: Testing the actual fetch/LLM call part is complex due to simulation.
    // If a real HTTP client were used and mocked (e.g. `jest.mock('node-fetch', () => jest.fn());`),
    // we could add tests like:
    // - `mockFetch` is called with correct URL, headers, and body.
    // - Test LLM API error (e.g., `mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" })`).
    // - Test successful streaming pipe `response.body.pipe(res)`.
});
