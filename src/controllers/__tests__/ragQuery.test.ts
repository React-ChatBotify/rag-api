import { Request, Response } from 'express';
import { handleRagQuery } from '../ragQuery';
import { initializedRagService } from '../../services/ragService';
import { generateText } from '../../services/llmWrapper'; // Import the mocked generateText

// Mock llmWrapper
jest.mock('../../services/llmWrapper', () => ({
    generateText: jest.fn(),
    generateEmbeddings: jest.fn(), // Though not directly used by handleRagQuery
}));

// Mock initializedRagService
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

// Mock config - no longer needed here as API keys are handled by llmWrapper's underlying services
// jest.mock('../../config', () => ({ /* ... */ }));


const mockRequest = (body: any = {}, params: any = {}, query: any = {}): Partial<Request> => ({
    body,
    params,
    query,
    on: jest.fn(), // For stream 'close' event
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
    let mockedGenerateText: jest.Mock;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRagService = await initializedRagService;
        mockedGenerateText = generateText as jest.Mock;
    });

    it('should return 400 if query is missing', async () => {
        const req = mockRequest({ provider: 'gemini' }) as Request; // Provider is optional but good to include
        const res = mockResponse() as Response;
        await handleRagQuery(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Bad Request: query is required and must be a non-empty string." });
    });

    it('should return 400 if provider is invalid', async () => {
        const req = mockRequest({ query: "test query", provider: "invalidProvider" }) as Request;
        const res = mockResponse() as Response;
        await handleRagQuery(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Bad Request: provider must be 'openai' or 'gemini'." });
    });

    it('should use "gemini" as default provider if none is specified', async () => {
        const req = mockRequest({ query: "test query" }) as Request; // No provider
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]);
        mockedGenerateText.mockResolvedValue({ text: "LLM response from Gemini", provider_model: "gemini-pro" });

        await handleRagQuery(req, res);

        expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 3);
        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'gemini',
            query: "test query", // No context, so original query
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'gemini',
            choices: expect.arrayContaining([
                expect.objectContaining({ message: expect.objectContaining({ content: "LLM response from Gemini" }) })
            ])
        }));
    });

    it('should handle query with no relevant chunks, calling llmWrapper with OpenAI provider', async () => {
        const req = mockRequest({ query: "test query", provider: "openai", stream: false }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]); // No chunks
        mockedGenerateText.mockResolvedValue({ text: "LLM response from OpenAI", provider_model: "gpt-3.5-turbo" });

        await handleRagQuery(req, res);

        expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 3);
        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'openai',
            query: "test query", // Original query passed as augmentedPrompt
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'openai',
            model: "gpt-3.5-turbo",
            choices: expect.arrayContaining([
                expect.objectContaining({ message: expect.objectContaining({ content: "LLM response from OpenAI" }) })
            ])
        }));
    });

    it('should handle query with relevant chunks, calling llmWrapper with Gemini provider and augmented prompt', async () => {
        const req = mockRequest({ query: "test query", provider: "gemini", n_results: 2, stream: false }) as Request;
        const res = mockResponse() as Response;
        const mockChunks = [
            { metadata: { original_content: "Content for doc1" } },
            { metadata: { original_content: "Content for doc2" } },
        ];
        mockRagService.queryChunks.mockResolvedValue(mockChunks);
        mockedGenerateText.mockResolvedValue({ text: "LLM response based on context", provider_model: "gemini-pro" });

        await handleRagQuery(req, res);
        
        const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Information:\n---\nContent for doc1\n---\nContent for doc2\n---\nBased on the relevant information above, answer the user query.`;

        expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 2);
        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'gemini',
            query: expectedAugmentedPrompt,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'gemini',
            model: "gemini-pro",
            choices: expect.arrayContaining([
                expect.objectContaining({ message: expect.objectContaining({ content: "LLM response based on context" }) })
            ])
        }));
    });
    
    it('should handle query with chunks but no original_content, using original query for llmWrapper', async () => {
        const req = mockRequest({ query: "original query", provider: "openai", stream: false }) as Request;
        const res = mockResponse() as Response;
        const mockChunks = [ { metadata: { /* no original_content */ } } ];
        mockRagService.queryChunks.mockResolvedValue(mockChunks);
        mockedGenerateText.mockResolvedValue({ text: "Response using original query", provider_model: "gpt-4" });

        await handleRagQuery(req, res);
        
        expect(mockRagService.queryChunks).toHaveBeenCalledWith("original query", 3);
        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'openai',
            query: "original query", // Should fallback to original query
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            provider: 'openai',
            model: "gpt-4",
            choices: expect.arrayContaining([
                expect.objectContaining({ message: expect.objectContaining({ content: "Response using original query" }) })
            ])
        }));
    });

    it('should return 501 Not Implemented for streaming requests', async () => {
        const req = mockRequest({ query: "test query stream", provider: "gemini", stream: true }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]); // To proceed to LLM call part

        await handleRagQuery(req, res);

        expect(res.status).toHaveBeenCalledWith(501);
        expect(res.json).toHaveBeenCalledWith({ error: "Streaming not implemented for this provider via RAG query." });
        expect(mockedGenerateText).not.toHaveBeenCalled(); // generateText should not be called
    });

    it('should return 503 if RAG service (queryChunks) fails', async () => {
        const req = mockRequest({ query: "test query", provider: "gemini" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));
        
        await handleRagQuery(req, res);
        
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ error: "Service Unavailable: RAG service is not ready." });
    });
    
    it('should return 500 if llmWrapper.generateText fails', async () => {
        const req = mockRequest({ query: "test query", provider: "openai" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue([]); // Success from RAG
        mockedGenerateText.mockRejectedValue(new Error("LLM provider outage"));

        await handleRagQuery(req, res);

        expect(mockedGenerateText).toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: "Failed to get response from LLM provider openai.", details: "LLM provider outage" });
    });

    // Removed tests for llm_model, API key configuration issues in controller,
    // as these responsibilities are now delegated to llmWrapper or its underlying services.
});
