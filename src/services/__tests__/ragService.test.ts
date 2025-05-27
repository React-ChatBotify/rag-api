import { ChromaClient } from 'chromadb-client'; // Removed ChromaCollection
import { pipeline, Pipeline } from '@xenova/transformers';
import { RAGService } from '../ragService'; // Adjust path as needed, assuming RAGService is default export or named export
import { config } from '../../config';

// Mocking external dependencies
jest.mock('chromadb-client');
jest.mock('@xenova/transformers');
jest.mock('../../config', () => ({
    config: {
        chromaUrl: 'http://localhost:8001',
        embeddingModelName: 'Xenova/all-MiniLM-L6-v2',
        // other config values as needed by RAGService
    },
}));

const mockPipelineInstance = {
    // Simulate the pipeline function call for feature extraction
    // It should return an object with a `data` property (Float32Array) and a `tolist()` method
    // or whatever structure the actual pipeline returns and RAGService uses.
    // Based on `Array.from(result.data as Float32Array)` in EmbeddingGenerator
    // and `await pipelineInstance(text, { pooling: 'mean', normalize: true });`
    // This mock needs to replicate that structure.
    // Let's assume it returns an object that has a `data` property which is an array-like structure.
    // For simplicity, let's say the generate method in EmbeddingGenerator will mock this.
} as jest.Mocked<Pipeline>;


// Mock implementation for the pipeline function
(pipeline as jest.Mock).mockResolvedValue(mockPipelineInstance);


describe('RAGService', () => {
    let ragService: RAGService;
    let mockChromaCollection: any; // Changed to any for now to bypass specific ChromaCollection type error

    beforeEach(async () => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock ChromaCollection methods
        mockChromaCollection = {
            add: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue({ ids: [], metadatas: [], documents: [] }),
            delete: jest.fn().mockResolvedValue(undefined),
            query: jest.fn().mockResolvedValue({ ids: [[]], metadatas: [[]], documents: [[]], distances: [[]] }),
        } as any; // Using 'any' to simplify complex type, or define all methods if needed

        // Mock ChromaClient methods
        (ChromaClient as jest.Mock).mockImplementation(() => ({
            getOrCreateCollection: jest.fn().mockResolvedValue(mockChromaCollection),
        }));
        
        // Initialize RAGService. Note: RAGService's constructor instantiates EmbeddingGenerator.
        // We need to ensure that EmbeddingGenerator.getInstance() is also properly mocked if its internal
        // `pipeline` call isn't already handled by the global mock.
        // The EmbeddingGenerator.generate method is what we'll primarily mock for outputs.
        ragService = new RAGService(); // RAGService is the class name, not initializedRagService
        await ragService.init(); // Ensure collection is initialized

        // Mock the EmbeddingGenerator's generate method directly since it's part of RAGService
        // This is simpler than mocking the static getInstance and pipeline calls for every test.
        ragService['embeddingGenerator'].generate = jest.fn().mockImplementation(async (text: string) => {
            // Return a predictable embedding based on text length or content for testing
            return Array(10).fill(text.length / 10); 
        });
    });

    describe('init', () => {
        it('should get or create a collection on init', async () => {
            const client = new ChromaClient({ path: config.chromaUrl }); // Called in RAGService constructor
            await ragService.init();
            expect(client.getOrCreateCollection).toHaveBeenCalledWith({
                name: "rag_documents",
            });
        });

        it('should handle errors during init if getOrCreateCollection fails', async () => {
            (ChromaClient as jest.Mock).mockImplementationOnce(() => ({
                getOrCreateCollection: jest.fn().mockRejectedValue(new Error('Chroma init failed')),
            }));
            const newRagService = new RAGService();
            await expect(newRagService.init()).rejects.toThrow('Chroma init failed');
        });
    });

    describe('chunkMarkdown', () => {
        it('should split markdown into text chunks with parent_document_id and original_content', () => {
            const markdownContent = "# Title\n\nParagraph 1.\n\nParagraph 2.";
            const parentDocumentId = "doc1";
            const chunks = ragService.chunkMarkdown(markdownContent, parentDocumentId);
            
            expect(chunks.length).toBeGreaterThanOrEqual(2); // Title might be a chunk or ignored depending on impl.
                                                              // Based on current impl, title becomes empty and is filtered.
                                                              // So, 2 paragraphs.
            expect(chunks.length).toBe(2); 

            chunks.forEach(chunk => {
                expect(chunk.id).toBeDefined();
                expect(typeof chunk.text).toBe('string');
                expect(chunk.text.length).toBeGreaterThan(0);
                expect(chunk.parent_document_id).toBe(parentDocumentId);
                expect(chunk.original_content).toBe(markdownContent);
            });
            expect(chunks[0].text).toBe("Paragraph 1.");
            expect(chunks[1].text).toBe("Paragraph 2.");
        });

        it('should handle empty markdown', () => {
            const chunks = ragService.chunkMarkdown("", "doc2");
            expect(chunks).toEqual([]);
        });
    });

    describe('addDocument', () => {
        it('should chunk markdown, generate embeddings, and add to collection', async () => {
            const documentId = "doc3";
            const markdownContent = "Some content.";
            
            const chunkSpy = jest.spyOn(ragService, 'chunkMarkdown');
            // ragService['embeddingGenerator'].generate is already mocked in beforeEach

            await ragService.addDocument(documentId, markdownContent);

            expect(chunkSpy).toHaveBeenCalledWith(markdownContent, documentId);
            const expectedChunks = ragService.chunkMarkdown(markdownContent, documentId); // get what chunkMarkdown would return
            
            expect(ragService['embeddingGenerator'].generate).toHaveBeenCalledTimes(expectedChunks.length);
            for (const chunk of expectedChunks) {
                expect(ragService['embeddingGenerator'].generate).toHaveBeenCalledWith(chunk.text);
            }

            expect(mockChromaCollection.add).toHaveBeenCalledTimes(1);
            const addArgs = mockChromaCollection.add.mock.calls[0][0];
            expect(addArgs.ids.length).toBe(expectedChunks.length);
            expect(addArgs.embeddings.length).toBe(expectedChunks.length);
            expect(addArgs.metadatas.length).toBe(expectedChunks.length);
            addArgs.metadatas.forEach((metadata: any, index: number) => {
                expect(metadata.parent_document_id).toBe(documentId);
                expect(metadata.original_content).toBe(markdownContent);
                expect(metadata.text_chunk).toBe(expectedChunks[index].text);
            });
        });

         it('should not add if no chunks are generated', async () => {
            const documentId = "doc-empty";
            const markdownContent = ""; // Empty content will produce no chunks
            await ragService.addDocument(documentId, markdownContent);
            expect(ragService['embeddingGenerator'].generate).not.toHaveBeenCalled();
            expect(mockChromaCollection.add).not.toHaveBeenCalled();
        });
    });

    describe('getDocumentChunks', () => {
        it('should call chromaCollection.get with correct filter', async () => {
            const documentId = "doc4";
            // Mock the response for `get`
            const mockGetResponse = {
                ids: ["chunk1_id", "chunk2_id"],
                metadatas: [{ text_chunk: "text1", parent_document_id: documentId }, { text_chunk: "text2", parent_document_id: documentId }],
                documents: ["text1", "text2"] // Assuming documents also store the chunk text
            };
            mockChromaCollection.get.mockResolvedValue(mockGetResponse);

            const chunks = await ragService.getDocumentChunks(documentId);

            expect(mockChromaCollection.get).toHaveBeenCalledWith({
                where: { "parent_document_id": documentId },
            });
            expect(chunks.length).toBe(2);
            expect(chunks[0].id).toBe("chunk1_id");
            expect(chunks[0].text_content).toBe("text1");
            expect(chunks[0].metadata.parent_document_id).toBe(documentId);
        });
    });

    describe('getParentDocumentContent', () => {
        it('should retrieve original_content from the first chunk metadata', async () => {
            const documentId = "doc5";
            const originalMarkdown = "# Title\nContent here.";
            const mockGetResponse = {
                ids: ["chunk1_id"],
                metadatas: [{ original_content: originalMarkdown, parent_document_id: documentId }],
                documents: ["Content here."]
            };
            mockChromaCollection.get.mockResolvedValue(mockGetResponse); // Mock for getParentDocumentContent
            
            const content = await ragService.getParentDocumentContent(documentId);

            expect(mockChromaCollection.get).toHaveBeenCalledWith({
                where: { "parent_document_id": documentId },
                limit: 1,
                include: ["metadatas"]
            });
            expect(content).toBe(originalMarkdown);
        });

        it('should return null if no chunks or original_content found', async () => {
            const documentId = "doc6";
             mockChromaCollection.get.mockResolvedValue({ ids: [], metadatas: [], documents: [] });
            const content = await ragService.getParentDocumentContent(documentId);
            expect(content).toBeNull();
        });
    });

    describe('updateDocument', () => {
        it('should call deleteDocument and then addDocument', async () => {
            const documentId = "doc7";
            const newMarkdownContent = "New content.";
            
            const deleteSpy = jest.spyOn(ragService, 'deleteDocument').mockResolvedValue(undefined);
            const addSpy = jest.spyOn(ragService, 'addDocument').mockResolvedValue(undefined);

            await ragService.updateDocument(documentId, newMarkdownContent);

            expect(deleteSpy).toHaveBeenCalledWith(documentId);
            expect(addSpy).toHaveBeenCalledWith(documentId, newMarkdownContent);
        });
    });

    describe('deleteDocument', () => {
        it('should get chunk IDs and then call chromaCollection.delete', async () => {
            const documentId = "doc8";
            const mockChunkIds = ["id1", "id2"];
            mockChromaCollection.get.mockResolvedValue({ 
                ids: mockChunkIds, 
                metadatas: [], // Not strictly needed for this part of the test
                documents: [] // Not strictly needed
            });

            await ragService.deleteDocument(documentId);

            expect(mockChromaCollection.get).toHaveBeenCalledWith({
                where: { "parent_document_id": documentId },
                include: []
            });
            expect(mockChromaCollection.delete).toHaveBeenCalledWith({ ids: mockChunkIds });
        });

        it('should not call delete if no chunks are found', async () => {
            const documentId = "doc-nonexistent";
            mockChromaCollection.get.mockResolvedValue({ ids: [], metadatas: [], documents: [] });
            await ragService.deleteDocument(documentId);
            expect(mockChromaCollection.delete).not.toHaveBeenCalled();
        });
    });

    describe('queryChunks', () => {
        it('should generate query embedding and call chromaCollection.query', async () => {
            const queryText = "What is RAG?";
            const n_results = 3;
            const mockQueryEmbedding = [0.1, 0.2, 0.3];
            (ragService['embeddingGenerator'].generate as jest.Mock).mockResolvedValue(mockQueryEmbedding);

            const mockQueryResponse = {
                ids: [["id1", "id2"]],
                distances: [[0.1, 0.2]],
                metadatas: [[{ text_chunk: "RAG is...", parent_document_id:"docA" }, { text_chunk: "Retrieval Augmented Generation", parent_document_id:"docB" }]],
                documents: [["RAG is...", "Retrieval Augmented Generation"]]
            };
            mockChromaCollection.query.mockResolvedValue(mockQueryResponse);

            const results = await ragService.queryChunks(queryText, n_results);

            expect(ragService['embeddingGenerator'].generate).toHaveBeenCalledWith(queryText);
            expect(mockChromaCollection.query).toHaveBeenCalledWith({
                queryEmbeddings: [mockQueryEmbedding],
                nResults: n_results,
                include: ["metadatas", "documents", "distances"]
            });
            
            expect(results.length).toBe(2);
            expect(results[0].id).toBe("id1");
            expect(results[0].metadata.text_chunk).toBe("RAG is...");
            expect(results[0].distance).toBe(0.1);
        });
    });
});
