import { ChromaClient } from 'chromadb-client';
import { RAGService } from '../ragService';
import { config } from '../../config';
import { generateEmbeddings } from '../llmWrapper'; // Import the mocked generateEmbeddings

// Mock llmWrapper
jest.mock('../llmWrapper', () => ({
    generateEmbeddings: jest.fn(),
}));

// Mocking external dependencies
jest.mock('chromadb-client');
// jest.mock('@xenova/transformers'); // Removed
jest.mock('../../config', () => ({
    config: {
        chromaUrl: 'http://localhost:8001',
        // embeddingModelName: 'Xenova/all-MiniLM-L6-v2', // Removed
        chromaTenant: 'default_tenant', // Added for constructor test
        chromaDatabase: 'default_database', // Added for constructor test
        chromaAuthToken: '', // Added for constructor test
        chromaUsername: '', // Added for constructor test
        chromaPassword: '', // Added for constructor test
    },
}));

describe('RAGService', () => {
    let ragService: RAGService;
    let mockChromaCollection: any;
    let mockedGenerateEmbeddings: jest.Mock;

    beforeEach(async () => {
        jest.clearAllMocks();
        mockedGenerateEmbeddings = generateEmbeddings as jest.Mock;

        mockChromaCollection = {
            add: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue({ ids: [], metadatas: [], documents: [] }),
            delete: jest.fn().mockResolvedValue(undefined),
            query: jest.fn().mockResolvedValue({ ids: [[]], metadatas: [[]], documents: [[]], distances: [[]] }),
        };

        (ChromaClient as jest.Mock).mockImplementation(() => ({
            getOrCreateCollection: jest.fn().mockResolvedValue(mockChromaCollection),
        }));
        
        ragService = new RAGService();
        await ragService.init();

        // Default mock for generateEmbeddings for most tests
        mockedGenerateEmbeddings.mockImplementation(async (options: { text: string }) => ({
            embeddings: [{ embedding: Array(10).fill(options.text.length / 10) }],
            provider_model: 'gemini-test-model'
        }));
    });

    describe('init', () => {
        it('should get or create a collection on init', async () => {
            // Access the mocked ChromaClient constructor directly
            const MockChromaClientConstructor = ChromaClient as jest.Mock;
            // Assuming RAGService constructor calls new ChromaClient()
            // We need to check the instance created by RAGService,
            // which is not directly accessible here unless we modify RAGService or test ChromaClient instantiation separately.
            // For now, this test verifies that getOrCreateCollection was called on the instance.
            // To test constructor arguments of ChromaClient, we might need to spy on it or check its mock calls.
            
            // RAGService's constructor already called new ChromaClient and its init called getOrCreateCollection.
            // We get the instance of the mock ChromaClient that was created
            const mockChromaClientInstance = MockChromaClientConstructor.mock.instances[0];
            expect(mockChromaClientInstance.getOrCreateCollection).toHaveBeenCalledWith({
                name: "rag_documents",
            });
        });
    });

    describe('addDocument', () => {
        it('should chunk markdown, generate embeddings via llmWrapper, and add to collection', async () => {
            const documentId = "doc3";
            const markdownContent = "Some content.";
            
            const chunkSpy = jest.spyOn(ragService, 'chunkMarkdown');

            await ragService.addDocument(documentId, markdownContent);

            expect(chunkSpy).toHaveBeenCalledWith(markdownContent, documentId);
            const expectedChunks = ragService.chunkMarkdown(markdownContent, documentId);
            
            expect(mockedGenerateEmbeddings).toHaveBeenCalledTimes(expectedChunks.length);
            for (const chunk of expectedChunks) {
                expect(mockedGenerateEmbeddings).toHaveBeenCalledWith({
                    provider: 'gemini',
                    text: chunk.text,
                });
            }

            expect(mockChromaCollection.add).toHaveBeenCalledTimes(1);
            const addArgs = mockChromaCollection.add.mock.calls[0][0];
            expect(addArgs.ids.length).toBe(expectedChunks.length);
            expect(addArgs.embeddings.length).toBe(expectedChunks.length);
            // Check if embeddings match the mocked structure (array of 10, text.length/10)
            expect(addArgs.embeddings[0]).toEqual(Array(10).fill(expectedChunks[0].text.length / 10));
            expect(addArgs.metadatas.length).toBe(expectedChunks.length);
        });

         it('should not add if no chunks are generated', async () => {
            const documentId = "doc-empty";
            const markdownContent = "";
            await ragService.addDocument(documentId, markdownContent);
            expect(mockedGenerateEmbeddings).not.toHaveBeenCalled();
            expect(mockChromaCollection.add).not.toHaveBeenCalled();
        });

        it('should skip a chunk if embedding generation fails for it', async () => {
            const documentId = "doc-partial-fail";
            const markdownContent = "Chunk1.\n\nChunk2."; // Will create two chunks
            const expectedChunks = ragService.chunkMarkdown(markdownContent, documentId);

            // Mock generateEmbeddings to fail for the first chunk and succeed for the second
            mockedGenerateEmbeddings
                .mockResolvedValueOnce({ embeddings: [] }) // Simulate failure for first chunk (empty embeddings array)
                .mockResolvedValueOnce({ embeddings: [{ embedding: [0.5, 0.5] }], provider_model: "gemini-model" }); // Success for second

            await ragService.addDocument(documentId, markdownContent);

            expect(mockedGenerateEmbeddings).toHaveBeenCalledTimes(2);
            expect(mockChromaCollection.add).toHaveBeenCalledTimes(1);
            const addArgs = mockChromaCollection.add.mock.calls[0][0];
            // Only the second chunk should have been added
            expect(addArgs.ids.length).toBe(1);
            expect(addArgs.embeddings.length).toBe(1);
            expect(addArgs.embeddings[0]).toEqual([0.5, 0.5]);
            expect(addArgs.metadatas[0].text_chunk).toBe(expectedChunks[1].text);
        });
    });

    describe('queryChunks', () => {
        it('should generate query embedding via llmWrapper and call chromaCollection.query', async () => {
            const queryText = "What is RAG?";
            const n_results = 3;
            const mockQueryEmbeddingVector = [0.1, 0.2, 0.3];
            mockedGenerateEmbeddings.mockResolvedValue({ embeddings: [{ embedding: mockQueryEmbeddingVector }] });

            const mockQueryResponse = {
                ids: [["id1", "id2"]],
                distances: [[0.1, 0.2]],
                metadatas: [[{ text_chunk: "RAG is..." }, { text_chunk: "Retrieval Augmented Generation" }]],
                documents: [["RAG is...", "Retrieval Augmented Generation"]]
            };
            mockChromaCollection.query.mockResolvedValue(mockQueryResponse);

            const results = await ragService.queryChunks(queryText, n_results);

            expect(mockedGenerateEmbeddings).toHaveBeenCalledWith({
                provider: 'gemini',
                text: queryText,
            });
            expect(mockChromaCollection.query).toHaveBeenCalledWith({
                queryEmbeddings: [mockQueryEmbeddingVector],
                nResults: n_results,
                include: ["metadatas", "documents", "distances"]
            });
            expect(results.length).toBe(2);
        });

        it('should throw an error if query embedding generation fails', async () => {
            const queryText = "Test query";
            mockedGenerateEmbeddings.mockResolvedValue({ embeddings: [] }); // Simulate failure

            await expect(ragService.queryChunks(queryText, 3)).rejects.toThrow('Failed to generate query embedding.');
        });
    });

    // Other tests (chunkMarkdown, getDocumentChunks, getParentDocumentContent, updateDocument, deleteDocument)
    // remain largely the same as they don't directly interact with embedding generation,
    // but their setup might implicitly rely on the beforeEach mock of generateEmbeddings if they call addDocument.
    // For brevity, only core changes shown. Ensure these other tests are still valid.

    describe('chunkMarkdown', () => {
        it('should split markdown into text chunks', () => {
            const markdownContent = "# Title\n\nParagraph 1.\n\nParagraph 2.";
            const parentDocumentId = "doc1";
            const chunks = ragService.chunkMarkdown(markdownContent, parentDocumentId);
            expect(chunks.length).toBe(2);
            expect(chunks[0].text).toBe("Paragraph 1.");
        });
    });

    describe('deleteDocument', () => {
        it('should get chunk IDs and then call chromaCollection.delete', async () => {
            const documentId = "doc8";
            mockChromaCollection.get.mockResolvedValue({ ids: ["id1", "id2"] });
            await ragService.deleteDocument(documentId);
            expect(mockChromaCollection.get).toHaveBeenCalledWith({
                where: { "parent_document_id": documentId },
                include: []
            });
            expect(mockChromaCollection.delete).toHaveBeenCalledWith({ ids: ["id1", "id2"] });
        });
    });
});
