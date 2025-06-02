// Declare variables for holding mock functions
let mockMongoSave: jest.Mock;
let mockMongoGet: jest.Mock;
let mockMongoDelete: jest.Mock;
let mockMongoConnect: jest.Mock;
let mockedGenerateEmbeddings: jest.Mock; // For llmWrapper
let MockChromaClientConstructor: jest.Mock; // For ChromaClient
let mockGetOrCreateCollection: jest.Mock; // For ChromaClient's method

// Mock llmWrapper - must come before RAGService import
jest.mock('../llmWrapper', () => {
    mockedGenerateEmbeddings = jest.fn();
    return {
        generateEmbeddings: mockedGenerateEmbeddings,
    };
});

// Mock mongoService - must come before RAGService import
jest.mock('../mongoService', () => {
  mockMongoSave = jest.fn();
  mockMongoGet = jest.fn();
  mockMongoDelete = jest.fn();
  mockMongoConnect = jest.fn().mockResolvedValue(undefined);
  return {
    __esModule: true,
    mongoService: {
      saveDocument: mockMongoSave,
      getDocument: mockMongoGet,
      deleteDocument: mockMongoDelete,
      connect: mockMongoConnect,
    }
  };
});

// Mocking chromadb-client - must come before RAGService import
jest.mock('chromadb-client', () => {
  // Define inner mocks for ChromaClient methods first
  mockGetOrCreateCollection = jest.fn(); // This will be assigned to the instance's method
  MockChromaClientConstructor = jest.fn().mockImplementation(() => ({
    getOrCreateCollection: mockGetOrCreateCollection,
  }));
  return {
    ChromaClient: MockChromaClientConstructor,
  };
});


// Mock config - must come before RAGService import
jest.mock('../../config', () => ({
    config: {
        chromaUrl: 'http://localhost:8001', // Minimal needed config
        chromaTenant: 'default_tenant',
        chromaDatabase: 'default_database',
        chromaAuthToken: '',
        // No chromaUsername/Password as they were removed from actual config
    },
}));

// NOW import the modules AFTER all mocks are set up
import { ChromaClient } from 'chromadb-client'; // Will be the mock constructor
import { RAGService } from '../ragService';
// import { config } from '../../config'; // config is mocked, direct import not needed for tests unless to check mock
// import { generateEmbeddings } from '../llmWrapper'; // generateEmbeddings is mocked, direct import not needed

describe('RAGService', () => {
    let ragService: RAGService;
    let mockChromaCollectionAdd: jest.Mock;
    let mockChromaCollectionGet: jest.Mock;
    let mockChromaCollectionDelete: jest.Mock;
    let mockChromaCollectionQuery: jest.Mock;


    beforeEach(async () => {
        // Clear all mocks that are defined in the outer scope
        mockMongoSave.mockClear();
        mockMongoGet.mockClear();
        mockMongoDelete.mockClear();
        mockMongoConnect.mockClear();
        mockedGenerateEmbeddings.mockClear();
        MockChromaClientConstructor.mockClear();
        mockGetOrCreateCollection.mockClear();

        // Setup the mock for getOrCreateCollection to return a collection with its own set of mocks for add, get, delete, query
        mockChromaCollectionAdd = jest.fn().mockResolvedValue(undefined);
        mockChromaCollectionGet = jest.fn().mockResolvedValue({ ids: [], metadatas: [], documents: [] });
        mockChromaCollectionDelete = jest.fn().mockResolvedValue(undefined);
        mockChromaCollectionQuery = jest.fn().mockResolvedValue({ ids: [[]], metadatas: [[]], documents: [[]], distances: [[]] });

        mockGetOrCreateCollection.mockResolvedValue({
            add: mockChromaCollectionAdd,
            get: mockChromaCollectionGet,
            delete: mockChromaCollectionDelete,
            query: mockChromaCollectionQuery,
        });
        
        ragService = new RAGService(); // RAGService constructor will use mocked ChromaClient
        await ragService.init(); // This will call mockGetOrCreateCollection

        // Default mock for generateEmbeddings for most tests after it's cleared
        mockedGenerateEmbeddings.mockImplementation(async (options: { text: string }) => ({ // Re-setup default behavior
            embeddings: [{ values: Array(10).fill(options.text.length / 10) }], // Assuming .values from previous fix
            provider_model: 'gemini-test-model'
        }));
    });

    describe('init', () => {
        it('should instantiate ChromaClient and call getOrCreateCollection on init', async () => {
            // Check if ChromaClient constructor was called by RAGService constructor
            expect(MockChromaClientConstructor).toHaveBeenCalledTimes(1);
            
            // Check if getOrCreateCollection was called by ragService.init()
            expect(mockGetOrCreateCollection).toHaveBeenCalledWith({
                name: "rag_documents",
            });
            // Note: mongoService.connect() is not called by RAGService.init() directly,
            // but by the exported initializedRagService. Testing that would require a different setup.
        });
    });

    describe('addDocument', () => {
        it('should save to MongoDB, chunk markdown, generate embeddings, and add to ChromaDB', async () => {
            const documentId = "doc3";
            const markdownContent = "Some content.";
            
            const chunkSpy = jest.spyOn(ragService, 'chunkMarkdown');

            await ragService.addDocument(documentId, markdownContent);

            expect(mockMongoSave).toHaveBeenCalledWith(documentId, markdownContent);
            expect(mockMongoSave).toHaveBeenCalledTimes(1);

            expect(chunkSpy).toHaveBeenCalledWith(markdownContent, documentId);
            const expectedChunks = await ragService.chunkMarkdown(markdownContent, documentId);
            
            expect(mockedGenerateEmbeddings).toHaveBeenCalledTimes(expectedChunks.length);
            for (const chunk of expectedChunks) {
                expect(mockedGenerateEmbeddings).toHaveBeenCalledWith({
                    // provider: 'gemini', // Removed based on previous fixes
                    text: chunk.text,
                });
            }

            expect(mockChromaCollectionAdd).toHaveBeenCalledTimes(1);
            const addArgs = mockChromaCollectionAdd.mock.calls[0][0];
            expect(addArgs.ids.length).toBe(expectedChunks.length);
            expect(addArgs.embeddings.length).toBe(expectedChunks.length);
            expect(addArgs.embeddings[0]).toEqual(Array(10).fill(expectedChunks[0].text.length / 10));
            expect(addArgs.metadatas.length).toBe(expectedChunks.length);
            expect(addArgs.metadatas[0]).toEqual({
                text_chunk: expectedChunks[0].text,
                parent_document_id: documentId,
                // No original_content here
            });
        });

         it('should not attempt to add to ChromaDB if no chunks are generated, but still save to Mongo', async () => {
            const documentId = "doc-empty";
            const markdownContent = ""; // This will result in 0 chunks
            await ragService.addDocument(documentId, markdownContent);

            expect(mockMongoSave).toHaveBeenCalledWith(documentId, markdownContent);
            expect(mockMongoSave).toHaveBeenCalledTimes(1);

            expect(mockedGenerateEmbeddings).not.toHaveBeenCalled();
            expect(mockChromaCollectionAdd).not.toHaveBeenCalled();
        });

        it('should save to Mongo and skip a chunk in ChromaDB if embedding generation fails for it', async () => {
            const documentId = "doc-partial-fail";
            const markdownContent = "Chunk1.\n\nChunk2.";
            const expectedChunks = await ragService.chunkMarkdown(markdownContent, documentId);

            // Mock generateEmbeddings to fail for the first chunk and succeed for the second
            mockedGenerateEmbeddings
                .mockResolvedValueOnce({ embeddings: [] })
                .mockResolvedValueOnce({ embeddings: [{ values: [0.5, 0.5] }], provider_model: "gemini-model" }); // Assuming .values

            await ragService.addDocument(documentId, markdownContent);

            expect(mockedGenerateEmbeddings).toHaveBeenCalledTimes(2); // Called for both chunks
            expect(mockMongoSave).toHaveBeenCalledWith(documentId, markdownContent); // Mongo save should still happen
            expect(mockChromaCollectionAdd).toHaveBeenCalledTimes(1); // Chroma add called once for the successful chunk
            const addArgs = mockChromaCollectionAdd.mock.calls[0][0];
            // ids will have all chunk ids, but embeddings and metadatas only for successful ones
            expect(addArgs.ids.length).toBe(expectedChunks.length); // Should be 2 if two chunks were processed for IDs
            expect(addArgs.embeddings.length).toBe(1); // Only one chunk's embeddings added
            expect(addArgs.metadatas.length).toBe(1); // Only one chunk's metadata added
            expect(addArgs.embeddings[0]).toEqual([0.5, 0.5]);
            expect(addArgs.metadatas[0].text_chunk).toBe(expectedChunks[1].text); // The second chunk
        });
    });

    describe('queryChunks', () => {
        it('should generate query embedding via llmWrapper and call chromaCollection.query', async () => {
            const queryText = "What is RAG?";
            const n_results = 3;
            const mockQueryEmbeddingVector = [0.1, 0.2, 0.3]; // Example embedding
            mockedGenerateEmbeddings.mockResolvedValue({ embeddings: [{ values: mockQueryEmbeddingVector }] }); // Assuming .values

            const mockQueryResponse = {
                ids: [["id1", "id2"]],
                distances: [[0.1, 0.2]],
                metadatas: [[{ text_chunk: "RAG is..." }, { text_chunk: "Retrieval Augmented Generation" }]],
                documents: [["RAG is...", "Retrieval Augmented Generation"]] // ChromaDB might return full documents
            };
            mockChromaCollectionQuery.mockResolvedValue(mockQueryResponse);

            const results = await ragService.queryChunks(queryText, n_results);

            expect(mockedGenerateEmbeddings).toHaveBeenCalledWith({
                // provider: 'gemini', // Removed
                text: queryText,
            });
            expect(mockChromaCollectionQuery).toHaveBeenCalledWith({
                queryEmbeddings: [mockQueryEmbeddingVector],
                nResults: n_results,
                include: ["metadatas", "documents", "distances"]
            });
            expect(results.length).toBe(2); // Based on mockQueryResponse structure
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
        it('should split markdown into text chunks without original_content', async () => { // Made test async
            const markdownContent = "# Title\n\nParagraph 1.\n\nParagraph 2.";
            const parentDocumentId = "doc1";
            const chunks = await ragService.chunkMarkdown(markdownContent, parentDocumentId); // Added await
            expect(chunks.length).toBe(3); // Expecting "Title", "Paragraph 1.", "Paragraph 2."
            expect(chunks[0].text).toBe("Title");
            expect(chunks[1].text).toBe("Paragraph 1.");
            expect(chunks[2].text).toBe("Paragraph 2.");
            expect(chunks[0]).not.toHaveProperty('original_content');
        });
    });

    describe('getParentDocumentContent', () => {
        it('should call mongoService.getDocument and return content', async () => {
            const documentId = "doc-parent";
            const mockContent = "Parent content from MongoDB";
            mockMongoGet.mockResolvedValueOnce({ _id: documentId, content: mockContent });

            const content = await ragService.getParentDocumentContent(documentId);

            expect(mockMongoGet).toHaveBeenCalledWith(documentId);
            expect(mockMongoGet).toHaveBeenCalledTimes(1);
            expect(content).toBe(mockContent);
            expect(mockChromaCollectionGet).not.toHaveBeenCalled();
        });

        it('should return null if mongoService.getDocument returns null', async () => {
            const documentId = "doc-parent-nonexistent";
            mockMongoGet.mockResolvedValueOnce(null);

            const content = await ragService.getParentDocumentContent(documentId);

            expect(mockMongoGet).toHaveBeenCalledWith(documentId);
            expect(mockMongoGet).toHaveBeenCalledTimes(1);
            expect(content).toBeNull();
        });
    });

    describe('updateDocument', () => {
        it('should delete old chunks from Chroma, then call addDocument', async () => {
            const documentId = "doc-update";
            const newMarkdownContent = "Updated markdown content.";
            const oldChunkIds = ["old-chunk-1", "old-chunk-2"];

            mockChromaCollectionGet.mockResolvedValueOnce({ ids: oldChunkIds }); // Corrected: Use mockChromaCollectionGet

            // Spy on addDocument to verify it's called correctly without re-testing its internals here
            const addDocumentSpy = jest.spyOn(ragService, 'addDocument').mockResolvedValue(undefined);

            await ragService.updateDocument(documentId, newMarkdownContent);

            // Verify old chunks were fetched and deleted
            expect(mockChromaCollectionGet).toHaveBeenCalledWith({
                where: { "parent_document_id": documentId },
                include: []
            });
            expect(mockChromaCollectionDelete).toHaveBeenCalledWith({ ids: oldChunkIds });

            // Verify addDocument was called
            expect(addDocumentSpy).toHaveBeenCalledWith(documentId, newMarkdownContent);
            expect(addDocumentSpy).toHaveBeenCalledTimes(1);

            addDocumentSpy.mockRestore();
        });
    });

    describe('deleteDocument', () => {
        it('should delete chunks from ChromaDB and then delete from MongoDB', async () => {
            const documentId = "doc8";
            mockChromaCollectionGet.mockResolvedValue({ ids: ["id1", "id2"] });

            await ragService.deleteDocument(documentId);

            expect(mockChromaCollectionGet).toHaveBeenCalledWith({
                where: { "parent_document_id": documentId },
                include: []
            });
            expect(mockChromaCollectionDelete).toHaveBeenCalledWith({ ids: ["id1", "id2"] });

            expect(mockMongoDelete).toHaveBeenCalledWith(documentId);
            expect(mockMongoDelete).toHaveBeenCalledTimes(1);
        });

        it('should still attempt to delete from MongoDB even if no chunks are found in ChromaDB', async () => {
            const documentId = "doc-no-chunks";
            mockChromaCollectionGet.mockResolvedValue({ ids: [] });

            await ragService.deleteDocument(documentId);

            expect(mockChromaCollectionGet).toHaveBeenCalledTimes(1);
            expect(mockChromaCollectionDelete).not.toHaveBeenCalled();

            expect(mockMongoDelete).toHaveBeenCalledWith(documentId);
            expect(mockMongoDelete).toHaveBeenCalledTimes(1);
        });
    });
});
