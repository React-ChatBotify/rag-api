import { Collection, MongoClient } from 'mongodb';

import { config } from '../config';

export type ParentDocument = {
  _id: string;
  content: string;
};

class MongoService {
  private client: MongoClient;
  private dbName: string;

  constructor() {
    this.client = new MongoClient(config.MONGODB_URI);
    this.dbName = config.MONGODB_DATABASE_NAME;
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async getParentDocumentCollection(): Promise<Collection<ParentDocument>> {
    const db = this.client.db(this.dbName);
    return db.collection<ParentDocument>('parent_documents');
  }

  async saveDocument(documentId: string, content: string): Promise<void> {
    const collection = await this.getParentDocumentCollection();
    await collection.updateOne({ _id: documentId }, { $set: { _id: documentId, content: content } }, { upsert: true });
  }

  async getDocument(documentId: string): Promise<ParentDocument | null> {
    const collection = await this.getParentDocumentCollection();
    return collection.findOne({ _id: documentId });
  }

  async deleteDocument(documentId: string): Promise<void> {
    const collection = await this.getParentDocumentCollection();
    await collection.deleteOne({ _id: documentId });
  }

  async getAllDocumentIds(): Promise<string[]> {
    const collection = await this.getParentDocumentCollection();
    const documents = await collection.find({}, { projection: { _id: 1 } }).toArray();
    return documents.map((doc) => doc._id);
  }
}

export const mongoService = new MongoService();
