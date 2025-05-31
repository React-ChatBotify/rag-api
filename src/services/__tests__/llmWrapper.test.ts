import { generateText, generateEmbeddings } from '../llmWrapper';
import { fetchOpenaiResponse, getOpenaiEmbedding } from '../openai';
import {
    streamGenerateContent,
    batchGenerateContent,
    batchEmbedContents
} from '../gemini';
import { config } from '../../config';
import {
    OpenAIChatCompletionResponse,
    GeminiChatCompletionResponse,
    OpenAIEmbeddingsResponse,
    GeminiBatchEmbeddingsResponse,
    OpenAIChatCompletionChunk,
    GeminiStreamChunk, // This is GeminiChatCompletionResponse
    LLMChatResponse,
    LLMEmbeddingsResponse,
    LLMStreamChunk,
    OpenAIEmbeddingsPayload,
    GeminiBatchEmbeddingsRequest,
    GeminiContent,
    OpenAIChatMessage,
    OpenAIEmbedding,
    GeminiEmbedding,
} from '../../types';

// Mock underlying services
const mockFetchOpenaiResponse = fetchOpenaiResponse as jest.Mock;
const mockGetOpenaiEmbedding = getOpenaiEmbedding as jest.Mock;
const mockStreamGenerateContent = streamGenerateContent as jest.Mock;
const mockBatchGenerateContent = batchGenerateContent as jest.Mock;
const mockBatchEmbedContents = batchEmbedContents as jest.Mock;

jest.mock('../openai', () => ({
    fetchOpenaiResponse: jest.fn(),
    getOpenaiEmbedding: jest.fn(),
}));

jest.mock('../gemini', () => ({
    streamGenerateContent: jest.fn(),
    batchGenerateContent: jest.fn(),
    batchEmbedContents: jest.fn(),
}));

jest.mock('../../config', () => ({
    config: {
        openaiApiKey: 'test-openai-key',
        geminiApiKey: 'test-gemini-key',
        openAiChatModel: 'gpt-3.5-turbo-test',
        openAiEmbeddingModel: 'text-embedding-ada-002-test',
        geminiChatModel: 'gemini-pro-test',
        geminiEmbeddingModel: 'embedding-001-test',
        // other necessary config values like RAG_API_KEY etc.
        ragApiKey: 'test-rag-api-key',
    },
}));

describe('LLM Wrapper Service', () => {
    const mockQuery = "Test query";
    const mockTexts = ["Test text 1 for embedding", "Test text 2 for embedding"];

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateText', () => {
        // Non-Streaming Tests
        it('should call fetchOpenaiResponse for openai provider (non-streaming) and return correct structure', async () => {
            const mockApiResponse: OpenAIChatCompletionResponse = {
                id: 'chatcmpl-mockId',
                object: 'chat.completion',
                created: Date.now(),
                model: config.openAiChatModel,
                choices: [{ index: 0, message: { role: 'assistant', content: "OpenAI response" }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
            };
            mockFetchOpenaiResponse.mockResolvedValue(mockApiResponse);

            const result = await generateText({ provider: 'openai', query: mockQuery }) as LLMChatResponse;

            expect(mockFetchOpenaiResponse).toHaveBeenCalledWith({
                model: config.openAiChatModel,
                messages: [{ role: 'user', content: mockQuery } as OpenAIChatMessage],
                stream: false,
            });
            expect(result.provider).toBe('openai');
            expect(result).toEqual(expect.objectContaining(mockApiResponse));
        });

        it('should call batchGenerateContent for gemini provider (non-streaming) and return correct structure', async () => {
            const mockApiResponse: GeminiChatCompletionResponse = {
                candidates: [{
                    content: { role: 'model', parts: [{ text: "Gemini response" }] },
                    finishReason: 'STOP',
                    index: 0,
                    safetyRatings: [],
                }],
                promptFeedback: { safetyRatings: [] }
            };
            mockBatchGenerateContent.mockResolvedValue(mockApiResponse);

            const result = await generateText({ provider: 'gemini', query: mockQuery }) as LLMChatResponse;
            const expectedContents: GeminiContent[] = [{ role: 'user', parts: [{ text: mockQuery }] }];


            expect(mockBatchGenerateContent).toHaveBeenCalledWith(
                config.geminiChatModel,
                expectedContents
            );
            expect(result.provider).toBe('gemini');
            expect(result).toEqual(expect.objectContaining(mockApiResponse));
        });

        // Streaming Tests
        it('should call fetchOpenaiResponse and trigger onChunk for openai provider (streaming)', async () => {
            const mockOnChunk = jest.fn();
            const mockChunk: OpenAIChatCompletionChunk = {
                id: 'chunk-id', object: 'chat.completion.chunk', created: Date.now(), model: config.openAiChatModel,
                choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }]
            };

            mockFetchOpenaiResponse.mockImplementation(async (payload, onChunkCallback) => {
                if (payload.stream && onChunkCallback) {
                    onChunkCallback(mockChunk);
                }
                return Promise.resolve(); // Stream function returns void
            });

            const result = await generateText({ provider: 'openai', query: mockQuery, stream: true, onChunk: mockOnChunk });

            expect(mockFetchOpenaiResponse).toHaveBeenCalledWith(
                expect.objectContaining({ stream: true, messages: [{role: 'user', content: mockQuery}] }),
                expect.any(Function)
            );
            expect(mockOnChunk).toHaveBeenCalledWith({ ...mockChunk, provider: 'openai' });
            expect(result).toBeUndefined();
        });

        it('should call streamGenerateContent and trigger onChunk for gemini provider (streaming)', async () => {
            const mockOnChunk = jest.fn();
            // GeminiStreamChunk is GeminiChatCompletionResponse
            const mockChunk: GeminiStreamChunk = {
                candidates: [{
                    content: { role: 'model', parts: [{ text: "Hello" }] },
                    index: 0
                }]
            };

            mockStreamGenerateContent.mockImplementation(async (modelId, contents, onChunkCallback) => {
                if (onChunkCallback) {
                    onChunkCallback(mockChunk);
                }
                return Promise.resolve();
            });
            const expectedContents: GeminiContent[] = [{ role: 'user', parts: [{ text: mockQuery }] }];

            const result = await generateText({ provider: 'gemini', query: mockQuery, stream: true, onChunk: mockOnChunk });

            expect(mockStreamGenerateContent).toHaveBeenCalledWith(
                config.geminiChatModel,
                expectedContents,
                expect.any(Function)
            );
            expect(mockOnChunk).toHaveBeenCalledWith({ ...mockChunk, provider: 'gemini' });
            expect(result).toBeUndefined();
        });

        // Error Handling Tests
        it('should throw error if query is missing for generateText', async () => {
            await expect(generateText({ provider: 'openai', query: '' }))
                .rejects.toThrow('Query is required for text generation.');
        });

        it('should throw error for unsupported provider in generateText', async () => {
            await expect(generateText({ provider: 'unsupported' as any, query: mockQuery }))
                .rejects.toThrow('Unsupported provider: unsupported');
        });

        it('should throw error if stream is true but onChunk is missing', async () => {
            await expect(generateText({ provider: 'openai', query: mockQuery, stream: true }))
                .rejects.toThrow('onChunk callback is required for streaming responses.');
        });
    });

    describe('generateEmbeddings', () => {
        it('should call getOpenaiEmbedding for openai provider and return correct structure', async () => {
            const mockApiResponse: OpenAIEmbeddingsResponse = {
                object: 'list', data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 } as OpenAIEmbedding],
                model: config.openAiEmbeddingModel, usage: { prompt_tokens: 2, total_tokens: 2 }
            };
            mockGetOpenaiEmbedding.mockResolvedValue(mockApiResponse);
            const expectedPayload: OpenAIEmbeddingsPayload = { input: mockTexts, model: config.openAiEmbeddingModel };


            const result = await generateEmbeddings({ provider: 'openai', texts: mockTexts }) as LLMEmbeddingsResponse;

            expect(mockGetOpenaiEmbedding).toHaveBeenCalledWith(expectedPayload);
            expect(result.provider).toBe('openai');
            expect(result).toEqual(expect.objectContaining(mockApiResponse));
        });

        it('should call batchEmbedContents for gemini provider and return correct structure', async () => {
            const mockApiResponse: GeminiBatchEmbeddingsResponse = {
                embeddings: [{ model: `models/${config.geminiEmbeddingModel}`, values: [0.3, 0.4] } as GeminiEmbedding]
            };
            mockBatchEmbedContents.mockResolvedValue(mockApiResponse);

            const prefixedModelId = `models/${config.geminiEmbeddingModel}`;
            const expectedPayload: GeminiBatchEmbeddingsRequest = {
                requests: mockTexts.map(text => ({
                    model: prefixedModelId,
                    content: { parts: [{ text }] }
                }))
            };

            const result = await generateEmbeddings({ provider: 'gemini', texts: mockTexts }) as LLMEmbeddingsResponse;

            expect(mockBatchEmbedContents).toHaveBeenCalledWith(expectedPayload);
            expect(result.provider).toBe('gemini');
            expect(result).toEqual(expect.objectContaining(mockApiResponse));
        });

        it('should use provided model for OpenAI embeddings', async () => {
            const customModel = 'text-embedding-3-large-test';
            mockGetOpenaiEmbedding.mockResolvedValue({} as OpenAIEmbeddingsResponse); // Response content doesn't matter for this check
            await generateEmbeddings({ provider: 'openai', texts: mockTexts, model: customModel });
            expect(mockGetOpenaiEmbedding).toHaveBeenCalledWith(
                expect.objectContaining({ model: customModel })
            );
        });

        it('should use provided model for Gemini embeddings and prefix it correctly', async () => {
            const customModel = 'embedding-custom-test';
            mockBatchEmbedContents.mockResolvedValue({} as GeminiBatchEmbeddingsResponse);
            await generateEmbeddings({ provider: 'gemini', texts: mockTexts, model: customModel });
            expect(mockBatchEmbedContents).toHaveBeenCalledWith(
                expect.objectContaining({
                    requests: expect.arrayContaining([
                        expect.objectContaining({ model: `models/${customModel}` })
                    ])
                })
            );
        });


        it('should throw error if texts are missing for generateEmbeddings', async () => {
            await expect(generateEmbeddings({ provider: 'openai', texts: [] }))
                .rejects.toThrow('Texts are required for generating embeddings.');
        });

        it('should throw error for unsupported provider in generateEmbeddings', async () => {
            await expect(generateEmbeddings({ provider: 'unsupported' as any, texts: mockTexts }))
                .rejects.toThrow('Unsupported provider for embeddings: unsupported');
        });
    });
});
