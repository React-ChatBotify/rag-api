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

describe('handleRagQuery - RAG Type Functionality', () => {
    let mockRagService: any;
    let mockedGenerateText: jest.Mock;

    const mockChunksWithAllMetadata = [
        { metadata: { text_chunk: "Chunk 1 text.", original_content: "Parent document 1 content." } },
        { metadata: { text_chunk: "Chunk 2 text.", original_content: "Parent document 2 content." } },
        { metadata: { text_chunk: "Chunk 3 text from doc 1.", original_content: "Parent document 1 content." } }, // Duplicate parent
    ];

    beforeEach(async () => {
        jest.clearAllMocks();
        mockRagService = await initializedRagService;
        mockedGenerateText = generateText as jest.Mock;
        mockedGenerateText.mockResolvedValue({ text: "LLM response", provider_model: "mock-model" }); // Default mock response
    });

    it('should default to "basic" RAG if rag_type is not provided, using text_chunk for context', async () => {
        const req = mockRequest({ query: "test query", provider: "gemini" }) as Request; // rag_type not provided
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue(mockChunksWithAllMetadata.slice(0, 2)); // Use 2 chunks for simplicity

        await handleRagQuery(req, res);

        const expectedContext = `${mockChunksWithAllMetadata[0].metadata.text_chunk}\n---\n${mockChunksWithAllMetadata[1].metadata.text_chunk}`;
        const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Text Chunks:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

        expect(mockRagService.queryChunks).toHaveBeenCalledWith("test query", 3); // Default n_results
        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'gemini',
            query: expectedAugmentedPrompt,
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            choices: expect.arrayContaining([
                expect.objectContaining({ message: expect.objectContaining({ content: "LLM response" }) })
            ])
        }));
    });

    it('should use "basic" RAG when rag_type is "basic", using text_chunk for context', async () => {
        const req = mockRequest({ query: "test query", provider: "openai", rag_type: "basic" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue(mockChunksWithAllMetadata.slice(0, 2));

        await handleRagQuery(req, res);

        const expectedContext = `${mockChunksWithAllMetadata[0].metadata.text_chunk}\n---\n${mockChunksWithAllMetadata[1].metadata.text_chunk}`;
        const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Text Chunks:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'openai',
            query: expectedAugmentedPrompt,
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should use "advanced" RAG when rag_type is "advanced", using unique original_content for context', async () => {
        const req = mockRequest({ query: "test query", provider: "gemini", rag_type: "advanced" }) as Request;
        const res = mockResponse() as Response;
        mockRagService.queryChunks.mockResolvedValue(mockChunksWithAllMetadata); // Provide all 3 chunks

        await handleRagQuery(req, res);

        // Expect unique parent documents
        const expectedContext = `${mockChunksWithAllMetadata[0].metadata.original_content}\n---\n${mockChunksWithAllMetadata[1].metadata.original_content}`;
        const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Information from Parent Documents:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'gemini',
            query: expectedAugmentedPrompt,
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should handle "advanced" RAG with no original_content in some chunks gracefully', async () => {
        const req = mockRequest({ query: "test query", provider: "gemini", rag_type: "advanced" }) as Request;
        const res = mockResponse() as Response;
        const mixedChunks = [
            { metadata: { text_chunk: "Chunk 1 text.", original_content: "Parent document 1 content." } },
            { metadata: { text_chunk: "Chunk 2 text." /* no original_content */ } },
            { metadata: { text_chunk: "Chunk 3 text.", original_content: "Parent document 3 content." } },
        ];
        mockRagService.queryChunks.mockResolvedValue(mixedChunks);

        await handleRagQuery(req, res);

        const expectedContext = `${mixedChunks[0].metadata.original_content}\n---\n${mixedChunks[2].metadata.original_content}`;
        const expectedAugmentedPrompt = `User Query: test query\n\nRelevant Information from Parent Documents:\n---\n${expectedContext}\n---\nBased on the relevant information above, answer the user query.`;

        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'gemini',
            query: expectedAugmentedPrompt,
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should fall back to original query if "advanced" RAG results in no usable original_content', async () => {
        const req = mockRequest({ query: "test query", provider: "gemini", rag_type: "advanced" }) as Request;
        const res = mockResponse() as Response;
        const noOriginalContentChunks = [
            { metadata: { text_chunk: "Chunk 1 text." /* no original_content */ } },
            { metadata: { text_chunk: "Chunk 2 text." /* no original_content */ } },
        ];
        mockRagService.queryChunks.mockResolvedValue(noOriginalContentChunks);

        await handleRagQuery(req, res);

        // Expect original query because no original_content was found
        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'gemini',
            query: "test query",
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should fall back to original query if "basic" RAG results in no usable text_chunk (or document fallback)', async () => {
        const req = mockRequest({ query: "test query", provider: "gemini", rag_type: "basic" }) as Request;
        const res = mockResponse() as Response;
        const noTextChunkContent = [
            { metadata: { /* no text_chunk, no original_content */ } },
            // document field is another fallback, let's assume it's also empty or not what we want for this specific test
            { metadata: {}, document: "  " },
        ];
        mockRagService.queryChunks.mockResolvedValue(noTextChunkContent);

        await handleRagQuery(req, res);

        expect(mockedGenerateText).toHaveBeenCalledWith({
            provider: 'gemini',
            query: "test query", // Expect original query
        });
        expect(res.status).toHaveBeenCalledWith(200);
    });


    it('should return 400 if rag_type is invalid', async () => {
        const req = mockRequest({ query: "test query", provider: "openai", rag_type: "super_advanced" }) as Request;
        const res = mockResponse() as Response;

        await handleRagQuery(req, res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: "Bad Request: rag_type must be 'basic' or 'advanced'." });
        expect(mockedGenerateText).not.toHaveBeenCalled();
    });
});
