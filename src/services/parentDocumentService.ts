import mongoose from 'mongoose';
import { config } from '../config';
import { ParentDocumentModel } from '../models/parentDocument';

export class ParentDocumentService {
  constructor() {
    // Constructor remains empty, initialization logic is in init()
  }

  async storeDocument(documentId: string, content: string): Promise<void> {
    await ParentDocumentModel.findOneAndUpdate(
      { documentId },
      { content },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async getDocument(documentId: string): Promise<string | null> {
    const document = await ParentDocumentModel.findOne({ documentId });
    return document ? document.content : null;
  }

  async deleteDocument(documentId: string): Promise<boolean> {
    const result = await ParentDocumentModel.deleteOne({ documentId });
    return result.deletedCount > 0;
  }

  async init(): Promise<void> {
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB connection already established for parent documents.');
      return;
    }

    console.log('Attempting to connect to MongoDB for parent documents...');
    try {
      await mongoose.connect(config.mongoDbUri, {
        dbName: config.mongoDbName,
        autoIndex: true, // Recommended for development, consider disabling in production if managing indexes manually
      });
      console.log(`Successfully connected to MongoDB at ${config.mongoDbUri} (DB: ${config.mongoDbName}) for parent documents.`);

      // Optional: Event listeners for connection state changes
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error after initial connection:', err);
      });
      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected for parent documents.');
      });
      mongoose.connection.on('reconnected', () => {
        console.info('MongoDB reconnected for parent documents.');
      });

    } catch (error) {
      console.error(`Error connecting to MongoDB (DB: ${config.mongoDbName}):`, error);
      // Depending on application requirements, you might want to exit or throw
      // to prevent the service from running without a DB connection.
      throw new Error(`Failed to connect to MongoDB for parent documents: ${error}`);
    }
  }
}

const parentDocumentServiceInstance = new ParentDocumentService();

// Export a promise that resolves when the service is initialized
export const initializedParentDocumentService = parentDocumentServiceInstance.init()
  .then(() => parentDocumentServiceInstance)
  .catch(err => {
    console.error("Failed to initialize ParentDocumentService:", err);
    // Gracefully handle or exit, depending on application requirements
    // For critical services, exiting might be appropriate if the DB is essential at startup
    process.exit(1); // Example: Exit if DB connection fails during initial setup
    // return parentDocumentServiceInstance; // Or return instance without successful init
  });

export default parentDocumentServiceInstance; // Also export the instance directly if needed
