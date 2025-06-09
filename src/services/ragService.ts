import { ChromaClient } from 'chromadb-client';
import { marked } from 'marked';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../config';
import { generateEmbeddings } from '../services/llmWrapper';
import { mongoService } from './mongoService';

export class RAGService {
  private chromaClient: ChromaClient;
  private collectionName: string = 'rag_documents';
  private chromaCollection: any | undefined;

  constructor() {
    const fetchOpts: RequestInit = {};
    const headers: Record<string, string> = {};

    if (config.chromaAuthToken) {
      headers['Authorization'] = `Bearer ${config.chromaAuthToken}`;
    }
    // Removed chromaUsername/Password block as it's not in config

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
      fetchOptions: Object.keys(fetchOpts).length > 0 ? fetchOpts : undefined,
      path: `${config.chromaUrl}:${config.chromaPort}`,
    });
  }

  public async init(): Promise<void> {
    // The tenant and database are now configured at the client level via headers.
    // The collection name itself does not usually include tenant/database prefixes with this client setup.
    try {
      this.chromaCollection = await this.chromaClient.getOrCreateCollection({
        name: this.collectionName,
        // Optional: metadata: { "hnsw:space": "cosine" }
      });
      Logger.info(
        `ChromaDB collection '${this.collectionName}' ensured for tenant '${config.chromaTenant}' and database '${config.chromaDatabase}'.`
      );
    } catch (error) {
      Logger.error(
        `Error initializing ChromaDB collection for tenant '${config.chromaTenant}', database '${config.chromaDatabase}':`,
        error
      );
      throw error; // Propagate error to be handled by application startup
    }
  }

  // More methods will be added here
  public async chunkMarkdown(
    markdownContent: string,
    parentDocumentId: string
  ): Promise<Array<{ id: string; text: string; parent_document_id: string }>> {
    const htmlContent = await marked.parse(markdownContent); // Added await
    // A simple way to split by paragraphs; more sophisticated methods might be needed for complex HTML.
    const paragraphs = htmlContent.split(/<\/?p>/).filter((p: string) => p.trim() !== '');

    return paragraphs
      .map((paragraphText: string) => {
        const cleanText = paragraphText.replace(/<[^>]+>/g, '').trim(); // Remove any remaining HTML tags and trim
        if (cleanText.length === 0) {
          return null; // Skip empty paragraphs
        }
        return {
          id: uuidv4(),
          parent_document_id: parentDocumentId,
          text: cleanText,
        };
      })
      .filter((chunk) => chunk !== null) as Array<{ id: string; text: string; parent_document_id: string }>;
    // Type assertion for filter(chunk => chunk !== null) is okay here as we explicitly return null or an object.
  }

  public async addDocument(documentId: string, markdownContent: string): Promise<void> {
    if (!this.chromaCollection) {
      throw new Error('ChromaDB collection is not initialized.');
    }

    // Save the parent document to MongoDB
    await mongoService.saveDocument(documentId, markdownContent);

    const chunks = await this.chunkMarkdown(markdownContent, documentId); // Added await
    if (chunks.length === 0) {
      console.warn(`No chunks generated for document ID: ${documentId}. Nothing to add.`);
      return;
    }

    const ids: string[] = [];
    const embeddings: number[][] = [];
    const metadatas: Array<{ text_chunk: string; parent_document_id: string }> = [];

    for (const chunk of chunks) {
      ids.push(chunk.id);
      // const embedding = await this.embeddingGenerator.generate(chunk.text); // Old
      const embeddingResponse = await generateEmbeddings({
        // provider: 'gemini', // Removed as per TS error
        text: chunk.text,
      });
      if (
        !embeddingResponse ||
        !embeddingResponse.embeddings ||
        embeddingResponse.embeddings.length === 0 ||
        !embeddingResponse.embeddings[0].values
      ) {
        // Changed .embedding to .values
        Logger.error(`Failed to generate embedding for chunk ID: ${chunk.id}. Skipping.`); // Removed provider from log
        // Potentially skip this chunk or throw an error to halt the process
        continue;
      }
      const embedding = embeddingResponse.embeddings[0].values; // Changed .embedding to .values
      embeddings.push(embedding);
      metadatas.push({
        // Storing the cleaned chunk text
        parent_document_id: chunk.parent_document_id,
        text_chunk: chunk.text, // This is correctly set to documentId by chunkMarkdown
      });
    }

    try {
      await this.chromaCollection.add({ embeddings, ids, metadatas });
      Logger.info(`Added ${chunks.length} chunks for document ID: ${documentId}`);
    } catch (error) {
      Logger.error(`Error adding document ID ${documentId} to ChromaDB:`, error);
      throw error;
    }
  }

  public async getDocumentChunks(documentId: string): Promise<Array<any>> {
    if (!this.chromaCollection) {
      throw new Error('ChromaDB collection is not initialized.');
    }
    try {
      const results = await this.chromaCollection.get({
        where: { parent_document_id: documentId },
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
      Logger.info(`Retrieved ${chunks.length} chunks for document ID: ${documentId}`);
      return chunks;
    } catch (error) {
      Logger.error(`Error retrieving chunks for document ID ${documentId}:`, error);
      throw error;
    }
  }

  public async getParentDocumentContent(documentId: string): Promise<string | null> {
    try {
      const parentDocument = await mongoService.getDocument(documentId);
      if (parentDocument) {
        Logger.info(`Retrieved parent document content for ID: ${documentId} from MongoDB`);
        return parentDocument.content;
      } else {
        console.warn(`Parent document ID: ${documentId} not found in MongoDB.`);
        return null;
      }
    } catch (error) {
      Logger.error(`Error retrieving parent document content for ID ${documentId} from MongoDB:`, error);
      throw error; // Or handle more gracefully, e.g., return null
    }
  }

  public async updateDocument(documentId: string, newMarkdownContent: string): Promise<void> {
    Logger.info(`Attempting to update document ID: ${documentId}`);

    // Step 1: Delete old chunks from ChromaDB
    if (!this.chromaCollection) {
      throw new Error('ChromaDB collection is not initialized.');
    }
    const results = await this.chromaCollection.get({
      include: [],
      where: { parent_document_id: documentId }, // We only need IDs
    });
    const chunkIdsToDelete = results.ids;
    if (chunkIdsToDelete && chunkIdsToDelete.length > 0) {
      await this.chromaCollection.delete({ ids: chunkIdsToDelete });
      Logger.info(`Deleted ${chunkIdsToDelete.length} old chunks for document ID: ${documentId} as part of update.`);
    } else {
      Logger.info(`No old chunks found to delete for document ID: ${documentId} during update.`);
    }

    // Step 2: Add the new document version (which saves to Mongo and adds new chunks to Chroma)
    await this.addDocument(documentId, newMarkdownContent);
    Logger.info(`Successfully updated document ID: ${documentId}`);
  }

  public async deleteDocument(documentId: string): Promise<void> {
    if (!this.chromaCollection) {
      throw new Error('ChromaDB collection is not initialized.');
    }
    try {
      // First, get all chunk IDs for the given parent_document_id
      const results = await this.chromaCollection.get({
        include: [],
        where: { parent_document_id: documentId }, // We only need IDs
      });

      const chunkIdsToDelete = results.ids;

      if (chunkIdsToDelete && chunkIdsToDelete.length > 0) {
        await this.chromaCollection.delete({ ids: chunkIdsToDelete });
        Logger.info(`Deleted ${chunkIdsToDelete.length} chunks from ChromaDB for document ID: ${documentId}`);
      } else {
        Logger.info(`No chunks found in ChromaDB to delete for document ID: ${documentId}`);
      }

      // Delete parent document from MongoDB
      await mongoService.deleteDocument(documentId);
      Logger.info(`Parent document ID: ${documentId} deleted from MongoDB.`);
    } catch (error) {
      Logger.error(`Error deleting document ID ${documentId} from stores:`, error);
      throw error; // Re-throw to allow controller to handle
    }
  }

  public async queryChunks(queryText: string, n_results: number = 5): Promise<Array<any>> {
    if (!this.chromaCollection) {
      throw new Error('ChromaDB collection is not initialized.');
    }
    try {
      // const queryEmbedding = await this.embeddingGenerator.generate(queryText); // Old
      const embeddingResponse = await generateEmbeddings({
        // provider: 'gemini', // Removed as per TS error
        text: queryText,
      });
      if (
        !embeddingResponse ||
        !embeddingResponse.embeddings ||
        embeddingResponse.embeddings.length === 0 ||
        !embeddingResponse.embeddings[0].values
      ) {
        // Changed to check .values
        Logger.error(`Failed to generate query embedding for text: "${queryText}".`); // Removed provider from log
        throw new Error('Failed to generate query embedding.');
      }
      const queryEmbedding = embeddingResponse.embeddings[0].values; // Assuming .values is correct
      const results = await this.chromaCollection.query({
        include: ['metadatas', 'documents', 'distances'],
        nResults: n_results,
        queryEmbeddings: [queryEmbedding], // Include what's needed for context
      });

      // Process results to a more usable format if necessary
      // For example, combining metadatas, documents, and distances into a single object per result
      const processedResults = [];
      if (results.ids && results.ids.length > 0 && results.ids[0].length > 0) {
        for (let i = 0; i < results.ids[0].length; i++) {
          processedResults.push({
            distance: results.distances?.[0][i] || null,
            document: results.documents?.[0][i] || null,
            id: results.ids[0][i],
            metadata: results.metadatas?.[0][i] || {},
            // text_chunk is expected to be in metadata
            text_chunk: (results.metadatas?.[0][i]?.text_chunk as string) || results.documents?.[0][i] || '',
          });
        }
      }
      Logger.info(`Query for "${queryText}" returned ${processedResults.length} chunks.`);
      return processedResults;
    } catch (error) {
      Logger.error(`Error querying chunks for text "${queryText}":`, error);
      throw error;
    }
  }
}

// Export a promise that resolves when the service is initialized
// Ensure mongoService is connected before RAGService is considered initialized.
const ragServiceInstance = new RAGService();
export const initializedRagService = mongoService
  .connect()
  .then(() => ragServiceInstance.init())
  .then(() => ragServiceInstance)
  .catch((err) => {
    Logger.error('Failed to initialize RAGService or connect to MongoDB:', err);
    process.exit(1); // Or handle more gracefully
  });
