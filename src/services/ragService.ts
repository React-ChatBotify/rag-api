import { ChromaClient } from 'chromadb-client';
// import { pipeline, Pipeline } from '@xenova/transformers'; // Removed
import { marked } from 'marked';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer'; // Added for Basic Auth
import { config } from '../config';
import { generateEmbeddings } from '../services/llmWrapper'; // Added

// EmbeddingGenerator class removed

export class RAGService {
    private chromaClient: ChromaClient;
    // private embeddingGenerator: EmbeddingGenerator; // Removed
    private collectionName: string = "rag_documents";
    private chromaCollection: any | undefined;

    constructor() {
        const fetchOpts: RequestInit = {};
        const headers: Record<string, string> = {};

        if (config.chromaAuthToken) {
            headers['Authorization'] = `Bearer ${config.chromaAuthToken}`;
        } else if (config.chromaUsername && config.chromaPassword) {
            const basicAuth = Buffer.from(`${config.chromaUsername}:${config.chromaPassword}`).toString('base64');
            headers['Authorization'] = `Basic ${basicAuth}`;
        }

        if (config.chromaTenant && config.chromaTenant !== 'default_tenant') {
           headers['X-Chroma-Tenant'] = config.chromaTenant;
        }
        if (config.chromaDatabase && config.chromaDatabase !== 'default_database') {
           headers['X-Chroma-Database'] = config.chromaDatabase;
        }

        if (Object.keys(headers).length > 0) {
           fetchOpts.headers = headers;
        }

        this.chromaClient = new ChromaClient({
            path: `${config.chromaUrl}:${config.chromaPort}`,
            fetchOptions: Object.keys(fetchOpts).length > 0 ? fetchOpts : undefined
        });
        // this.embeddingGenerator = new EmbeddingGenerator(); // Removed
    }

    public async init(): Promise<void> {
        // The tenant and database are now configured at the client level via headers.
        // The collection name itself does not usually include tenant/database prefixes with this client setup.
        try {
            this.chromaCollection = await this.chromaClient.getOrCreateCollection({
                name: this.collectionName,
                // Optional: metadata: { "hnsw:space": "cosine" }
            });
            console.info(`ChromaDB collection '${this.collectionName}' ensured for tenant '${config.chromaTenant}' and database '${config.chromaDatabase}'.`);
        } catch (error) {
            console.error(`Error initializing ChromaDB collection for tenant '${config.chromaTenant}', database '${config.chromaDatabase}':`, error);
            throw error; // Propagate error to be handled by application startup
        }
    }

    // More methods will be added here
    public chunkMarkdown(markdownContent: string, parentDocumentId: string): Array<{ id: string, text: string, parent_document_id: string, original_content: string }> {
        const htmlContent = marked.parse(markdownContent);
        // A simple way to split by paragraphs; more sophisticated methods might be needed for complex HTML.
        const paragraphs = htmlContent.split(/<\/?p>/).filter(p => p.trim() !== '');

        return paragraphs.map(paragraphText => {
            const cleanText = paragraphText.replace(/<[^>]+>/g, '').trim(); // Remove any remaining HTML tags and trim
            if (cleanText.length === 0) {
                return null; // Skip empty paragraphs
            }
            return {
                id: uuidv4(),
                text: cleanText,
                parent_document_id: parentDocumentId,
                original_content: markdownContent, // Store the full original markdown
            };
        }).filter(chunk => chunk !== null) as Array<{ id: string, text: string, parent_document_id: string, original_content: string }>;
    }

    public async addDocument(documentId: string, markdownContent: string): Promise<void> {
        if (!this.chromaCollection) {
            throw new Error("ChromaDB collection is not initialized.");
        }

        const chunks = this.chunkMarkdown(markdownContent, documentId);
        if (chunks.length === 0) {
            console.warn(`No chunks generated for document ID: ${documentId}. Nothing to add.`);
            return;
        }

        const ids: string[] = [];
        const embeddings: number[][] = [];
        const metadatas: Array<{ text_chunk: string, parent_document_id: string, original_content: string }> = [];

        for (const chunk of chunks) {
            ids.push(chunk.id);
            // const embedding = await this.embeddingGenerator.generate(chunk.text); // Old
            const embeddingResponse = await generateEmbeddings({
                provider: 'gemini', // Defaulting to gemini for RAG embeddings
                text: chunk.text,
            });
            if (!embeddingResponse || !embeddingResponse.embeddings || embeddingResponse.embeddings.length === 0 || !embeddingResponse.embeddings[0].embedding) {
                console.error(`Failed to generate embedding for chunk ID: ${chunk.id} with provider 'gemini'. Skipping.`);
                // Potentially skip this chunk or throw an error to halt the process
                continue;
            }
            const embedding = embeddingResponse.embeddings[0].embedding;
            embeddings.push(embedding);
            metadatas.push({
                text_chunk: chunk.text, // Storing the cleaned chunk text
                parent_document_id: chunk.parent_document_id,
                original_content: chunk.original_content, // Storing the full original markdown
            });
        }

        try {
            await this.chromaCollection.add({ ids, embeddings, metadatas });
            console.info(`Added ${chunks.length} chunks for document ID: ${documentId}`);
        } catch (error) {
            console.error(`Error adding document ID ${documentId} to ChromaDB:`, error);
            throw error;
        }
    }

    public async getDocumentChunks(documentId: string): Promise<Array<any>> {
        if (!this.chromaCollection) {
            throw new Error("ChromaDB collection is not initialized.");
        }
        try {
            const results = await this.chromaCollection.get({
                where: { "parent_document_id": documentId },
                // include: ["metadatas", "documents"] // Ensure we get what we need
            });
            // The 'results' object from chromadb-client get() contains ids, metadatas, documents, etc.
            // We need to reconstruct the chunks as they were, or as needed by the caller.
            // For now, returning metadatas and documents (if available and useful)
            // Let's assume documents array holds the text_chunk if "documents" is included and populated.
            // If documents are not explicitly stored and retrieved via .get(), metadatas would be the primary source.
            
            // Based on chromadb-client documentation, .get() returns:
            // { ids: string[], embeddings: number[][] | null, metadatas: Metadata[] | null, documents: string[] | null, uris: string[] | null, data: Record<string, any> | null }
            // We are interested in metadatas primarily, and potentially documents if they store the chunk text.
            // Let's return an array of objects, each representing a chunk with its id, metadata, and document text.
            
            const chunks = [];
            if (results.ids && results.ids.length > 0) {
                for (let i = 0; i < results.ids.length; i++) {
                    chunks.push({
                        id: results.ids[i],
                        metadata: results.metadatas?.[i] || {},
                        text_content: results.documents?.[i] || (results.metadatas?.[i]?.text_chunk as string) || '',
                    });
                }
            }
            console.info(`Retrieved ${chunks.length} chunks for document ID: ${documentId}`);
            return chunks;
        } catch (error) {
            console.error(`Error retrieving chunks for document ID ${documentId}:`, error);
            throw error;
        }
    }

    public async getParentDocumentContent(documentId: string): Promise<string | null> {
        if (!this.chromaCollection) {
            throw new Error("ChromaDB collection is not initialized.");
        }
        try {
            // We only need to retrieve one chunk for the documentId to get the original_content
            const results = await this.chromaCollection.get({
                where: { "parent_document_id": documentId },
                limit: 1, 
                include: ["metadatas"] 
            });

            if (results.ids && results.ids.length > 0 && results.metadatas && results.metadatas.length > 0) {
                const firstChunkMetadata = results.metadatas[0] as { original_content?: string };
                if (firstChunkMetadata && typeof firstChunkMetadata.original_content === 'string') {
                    console.info(`Retrieved parent document content for ID: ${documentId}`);
                    return firstChunkMetadata.original_content;
                }
            }
            console.warn(`No original content found for parent document ID: ${documentId}. It might not exist or its chunks are missing original_content metadata.`);
            return null;
        } catch (error) {
            console.error(`Error retrieving parent document content for ID ${documentId}:`, error);
            throw error;
        }
    }

    public async updateDocument(documentId: string, newMarkdownContent: string): Promise<void> {
        console.info(`Attempting to update document ID: ${documentId}`);
        await this.deleteDocument(documentId); // Wait for deletion to complete
        await this.addDocument(documentId, newMarkdownContent); // Wait for addition to complete
        console.info(`Successfully updated document ID: ${documentId}`);
    }

    public async deleteDocument(documentId: string): Promise<void> {
        if (!this.chromaCollection) {
            throw new Error("ChromaDB collection is not initialized.");
        }
        try {
            // First, get all chunk IDs for the given parent_document_id
            const results = await this.chromaCollection.get({
                where: { "parent_document_id": documentId },
                include: [] // We only need IDs
            });

            const chunkIdsToDelete = results.ids;

            if (chunkIdsToDelete && chunkIdsToDelete.length > 0) {
                await this.chromaCollection.delete({ ids: chunkIdsToDelete });
                console.info(`Deleted ${chunkIdsToDelete.length} chunks for document ID: ${documentId}`);
            } else {
                console.info(`No chunks found to delete for document ID: ${documentId}`);
            }
        } catch (error) {
            console.error(`Error deleting document ID ${documentId} from ChromaDB:`, error);
            throw error;
        }
    }

    public async queryChunks(queryText: string, n_results: number = 5): Promise<Array<any>> {
        if (!this.chromaCollection) {
            throw new Error("ChromaDB collection is not initialized.");
        }
        try {
            // const queryEmbedding = await this.embeddingGenerator.generate(queryText); // Old
            const embeddingResponse = await generateEmbeddings({
                provider: 'gemini', // Defaulting to gemini for RAG query embeddings
                text: queryText,
            });
            if (!embeddingResponse || !embeddingResponse.embeddings || embeddingResponse.embeddings.length === 0 || !embeddingResponse.embeddings[0].embedding) {
                console.error(`Failed to generate query embedding for text: "${queryText}" with provider 'gemini'.`);
                throw new Error('Failed to generate query embedding.');
            }
            const queryEmbedding = embeddingResponse.embeddings[0].embedding;
            const results = await this.chromaCollection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: n_results,
                include: ["metadatas", "documents", "distances"] // Include what's needed for context
            });

            // Process results to a more usable format if necessary
            // For example, combining metadatas, documents, and distances into a single object per result
            const processedResults = [];
            if (results.ids && results.ids.length > 0 && results.ids[0].length > 0) {
                for (let i = 0; i < results.ids[0].length; i++) {
                    processedResults.push({
                        id: results.ids[0][i],
                        distance: results.distances?.[0][i] || null,
                        metadata: results.metadatas?.[0][i] || {},
                        document: results.documents?.[0][i] || null,
                        // text_chunk is expected to be in metadata
                        text_chunk: (results.metadatas?.[0][i]?.text_chunk as string) || results.documents?.[0][i] || '',
                    });
                }
            }
            console.info(`Query for "${queryText}" returned ${processedResults.length} chunks.`);
            return processedResults;
        } catch (error) {
            console.error(`Error querying chunks for text "${queryText}":`, error);
            throw error;
        }
    }
}

// Export a promise that resolves when the service is initialized
const ragServiceInstance = new RAGService();
export const initializedRagService = ragServiceInstance.init().then(() => ragServiceInstance).catch(err => {
    console.error("Failed to initialize RAGService:", err);
    process.exit(1); // Or handle more gracefully
});
