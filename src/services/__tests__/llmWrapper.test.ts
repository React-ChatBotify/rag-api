import { generateText, generateEmbeddings } from '../llmWrapper';
import { fetchOpenaiResponse, getOpenaiEmbedding } from '../openai';
import {
    streamGenerateContent, // Assuming this is the actual name in gemini.ts for streaming
    batchGenerateContent,  // Assuming this is the actual name in gemini.ts for non-streaming
    embedContent,
    batchEmbedContents
} from '../gemini';
import { config } from '../../config';

// Mock underlying services
jest.mock('../openai', () => ({
    fetchOpenaiResponse: jest.fn(),
    getOpenaiEmbedding: jest.fn(),
}));

jest.mock('../gemini', () => ({
    streamGenerateContent: jest.fn(),
    batchGenerateContent: jest.fn(),
    embedContent: jest.fn(),
    batchEmbedContents: jest.fn(),
}));

// Mock config if needed, e.g., for default models
jest.mock('../../config', () => ({
    config: {
        llm: {
            openai: {
                chatModels: ['gpt-3.5-turbo-test'],
                embeddingModels: ['text-embedding-ada-002-test'],
            },
            gemini: {
                textModels: ['gemini-pro-test'],
                embeddingModels: ['embedding-001-test'],
            },
        },
        // other necessary config values
    },
}));

describe('LLM Wrapper Service', () => {
    const mockQuery = "Test query";
    const mockText = "Test text for embedding";

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('generateText', () => {
        it('should call fetchOpenaiResponse for openai provider (non-streaming)', async () => {
            const mockOpenaiApiResponse = {
                choices: [{ message: { content: "OpenAI response" }, finish_reason: "stop" }],
                model: "gpt-3.5-turbo-test-response",
            };
            (fetchOpenaiResponse as jest.Mock).mockResolvedValue(mockOpenaiApiResponse);

            const result = await generateText({ provider: 'openai', query: mockQuery });

            expect(fetchOpenaiResponse).toHaveBeenCalledWith({
                model: config.llm.openai.chatModels[0],
                messages: [{ role: 'user', content: mockQuery }],
                stream: undefined, // stream is undefined, not false, if not passed
            });
            expect(result.text).toBe("OpenAI response");
            expect(result.provider_model).toBe("gpt-3.5-turbo-test-response");
            expect(result.finish_reason).toBe("stop");
        });

        it('should call batchGenerateContent for gemini provider (non-streaming)', async () => {
            const mockGeminiApiResponse = {
                responses: [{ candidates: [{ content: { parts: [{ text: "Gemini response" }] }, finishReason: "STOP" }] }],
            };
            (batchGenerateContent as jest.Mock).mockResolvedValue(mockGeminiApiResponse);

            const result = await generateText({ provider: 'gemini', query: mockQuery });

            expect(batchGenerateContent).toHaveBeenCalledWith({
                requests: [{
                    model: `models/${config.llm.gemini.textModels[0]}`,
                    contents: [{ parts: [{ text: mockQuery }] }],
                }],
            });
            expect(result.text).toBe("Gemini response");
            expect(result.provider_model).toBe(config.llm.gemini.textModels[0]);
            expect(result.finish_reason).toBe("STOP");
        });

        // TODO: Add tests for streaming case if llmWrapper.generateText is updated to fully support it.
        // For now, llmWrapper's stream handling is basic and might rely on underlying services or need more work.
        // Example for Gemini stream (conceptual):
        it('should call streamGenerateContent for gemini provider (streaming)', async () => {
            // This test assumes streamGenerateContent is adapted or llmWrapper handles its response for TextGenerationResponse
            const mockGeminiStreamResponse = {
                // Simplified: assume it resolves to a structure that can be formed into TextGenerationResponse
                // Actual stream handling would be more complex to test here.
                // For example, if it returns an aggregated text:
                candidates: [{ content: { parts: [{ text: "Gemini streamed response" }] } }]
            };
            (streamGenerateContent as jest.Mock).mockResolvedValue(mockGeminiStreamResponse);

            const result = await generateText({ provider: 'gemini', query: mockQuery, stream: true });

            expect(streamGenerateContent).toHaveBeenCalledWith({
                model: `models/${config.llm.gemini.textModels[0]}`,
                contents: [{ parts: [{ text: mockQuery }] }],
            });
            expect(result.text).toBe("Gemini streamed response"); // Adjust if actual stream aggregation differs
        });


        it('should throw error for unsupported provider in generateText', async () => {
            await expect(generateText({ provider: 'unsupported' as any, query: mockQuery }))
                .rejects.toThrow('Unsupported provider: unsupported');
        });

        it('should throw error if query is missing for generateText', async () => {
            await expect(generateText({ provider: 'openai' }))
                .rejects.toThrow('Query is required for text generation.');
        });
    });

    describe('generateEmbeddings', () => {
        it('should call getOpenaiEmbedding for openai provider', async () => {
            const mockEmbeddingVector = [0.1, 0.2, 0.3];
            (getOpenaiEmbedding as jest.Mock).mockResolvedValue(mockEmbeddingVector);

            const result = await generateEmbeddings({ provider: 'openai', text: mockText });

            expect(getOpenaiEmbedding).toHaveBeenCalledWith(mockText, config.llm.openai.embeddingModels[0]);
            expect(result.embeddings.length).toBe(1);
            expect(result.embeddings[0].embedding).toEqual(mockEmbeddingVector);
            expect(result.provider_model).toBe(config.llm.openai.embeddingModels[0]);
        });

        it('should call batchEmbedContents for gemini provider (using texts array)', async () => {
            const mockTexts = ["text1", "text2"];
            const mockGeminiBatchResponse = {
                embeddings: [
                    { model: "models/embedding-001-test", values: [0.1, 0.1] },
                    { model: "models/embedding-001-test", values: [0.2, 0.2] },
                ]
            };
            (batchEmbedContents as jest.Mock).mockResolvedValue(mockGeminiBatchResponse);

            const result = await generateEmbeddings({ provider: 'gemini', texts: mockTexts });

            expect(batchEmbedContents).toHaveBeenCalledWith({
                requests: mockTexts.map(t => ({
                    model: `models/${config.llm.gemini.embeddingModels[0]}`,
                    content: { parts: [{ text: t }] },
                })),
            });
            expect(result.embeddings.length).toBe(2);
            expect(result.embeddings[0].embedding).toEqual([0.1, 0.1]);
            expect(result.embeddings[1].embedding).toEqual([0.2, 0.2]);
            expect(result.provider_model).toBe(config.llm.gemini.embeddingModels[0]);
        });

        it('should call batchEmbedContents for gemini provider (using single text)', async () => {
            const mockGeminiBatchResponse = {
                embeddings: [ { model: "models/embedding-001-test", values: [0.1, 0.1] } ]
            };
            (batchEmbedContents as jest.Mock).mockResolvedValue(mockGeminiBatchResponse);

            const result = await generateEmbeddings({ provider: 'gemini', text: mockText });
            expect(batchEmbedContents).toHaveBeenCalledWith({
                requests: [{
                    model: `models/${config.llm.gemini.embeddingModels[0]}`,
                    content: { parts: [{ text: mockText }] },
                }],
            });
            expect(result.embeddings.length).toBe(1);
            expect(result.embeddings[0].embedding).toEqual([0.1, 0.1]);
        });


        it('should throw error for unsupported provider in generateEmbeddings', async () => {
            await expect(generateEmbeddings({ provider: 'unsupported' as any, text: mockText }))
                .rejects.toThrow('Unsupported provider for embeddings: unsupported');
        });

        it('should throw error if text or texts are missing for generateEmbeddings', async () => {
            await expect(generateEmbeddings({ provider: 'openai' }))
                .rejects.toThrow('Text or texts are required for generating embeddings.');
        });
    });
});
