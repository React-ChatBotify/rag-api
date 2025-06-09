// 1. Define all primitive mock functions that will be used by the constructor or instance.
const mockConnect = jest.fn();
const mockClose = jest.fn();
const mockUpdateOne = jest.fn();
const mockFindOne = jest.fn();
const mockDeleteOne = jest.fn();

// 2. Define mock functions that return other mocks (composing them).
const mockCollection = jest.fn(() => ({
  deleteOne: mockDeleteOne,
  findOne: mockFindOne,
  updateOne: mockUpdateOne,
}));
const mockDb = jest.fn(() => ({
  collection: mockCollection,
}));

// 3. Define the mock constructor for MongoClient. This uses the above mocks.
const mockMongoClientConstructor = jest.fn((uri) => {
  console.log('[Mock CONSTRUCTOR] MongoClient called with URI:', uri);
  return {
    close: mockClose,
    connect: mockConnect,
    db: mockDb,
  };
});

// 4. Use jest.doMock for non-hoisted mocking, before imports.
jest.doMock('mongodb', () => ({
  Collection: jest.fn(),
  Db: jest.fn(),
  MongoClient: mockMongoClientConstructor,
}));

// 5. NOW, require modules that will use the mocked 'mongodb'.
// Use require for dynamic/late import after doMock for runtime values.
const mongoServiceModule = require('../mongoService');
const mongoDbModule = require('mongodb');
const configModule = require('../../config');

const mongoService = mongoServiceModule.mongoService;
const ImportedMockClient = mongoDbModule.MongoClient; // This is our mock constructor
const config = configModule.config;
import type { ParentDocument } from '../mongoService';

describe('MongoService', () => {
  // No need to declare mongoService here, we will use the imported singleton instance.

  beforeEach(() => {
    // Clear mocks for methods called on the client instance.
    // mockMongoClientConstructor is NOT cleared here to preserve its call history from module import.
    // mockDb and mockCollection are also not cleared as they are part of the mock structure,
    // and their internal methods (mockUpdateOne etc.) are cleared.
    mockConnect.mockClear();
    mockClose.mockClear();
    mockUpdateOne.mockClear();
    mockFindOne.mockClear();
    mockDeleteOne.mockClear();

    mockFindOne.mockReset(); // Specifically reset findOne that has mockResolvedValueOnce

    // Create a new instance of MongoService before each test. NO! Use the imported singleton.
    // This ensures that any instance-specific state is reset.
    // Note: mongoService is exported as a singleton instance. For testing,
    // it might be better if MongoService was exported as a class and we instantiate it here.
    // Assuming `mongoService` is the default export or a named export from '../mongoService'
    // For this test, let's assume we can create a new instance for testing purposes or test the exported singleton.
    // If testing the exported singleton: import { mongoService as serviceInstance } from '../mongoService';
    // Then use serviceInstance throughout.
    // For better test isolation, it's preferable to instantiate. Let's assume MongoService class is available.
    // mongoService = new MongoService(); // This line is removed.
  });

  describe('constructor and connect', () => {
    it('should have instantiated MongoClient with config.MONGODB_URI upon import', () => {
      console.log('[TEST] Expected URI:', config.MONGODB_URI);

      // Verify that our setup is correct:
      expect(ImportedMockClient).toBe(mockMongoClientConstructor); // This passed before

      // Now, let's directly check the .mock property of the function we know was called:
      expect(mockMongoClientConstructor.mock.calls.length).toBe(1);
      expect(mockMongoClientConstructor.mock.calls[0][0]).toBe(config.MONGODB_URI);
    });

    it('should call client.connect when connect is invoked', async () => {
      await mongoService.connect();
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should call client.close when disconnect is invoked', async () => {
      await mongoService.disconnect();
      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('getParentDocumentCollection', () => {
    it('should call client.db and db.collection with correct names', async () => {
      // Ensure client.db().collection() is called correctly.
      // This method is async in the actual service, so we await it.
      await mongoService.getParentDocumentCollection();
      expect(mockDb).toHaveBeenCalledWith(config.MONGODB_DATABASE_NAME);
      expect(mockCollection).toHaveBeenCalledWith('parent_documents');
    });
  });

  describe('saveDocument', () => {
    it('should call collection.updateOne with correct parameters', async () => {
      const documentId = 'testId';
      const content = 'Test Content';
      // Mock getParentDocumentCollection to resolve with our mock collection object
      jest.spyOn(mongoService, 'getParentDocumentCollection').mockResolvedValueOnce(mockCollection() as any);

      await mongoService.saveDocument(documentId, content);

      expect(mongoService.getParentDocumentCollection).toHaveBeenCalledTimes(1);
      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: documentId },
        { $set: { _id: documentId, content: content } },
        { upsert: true }
      );
    });
  });

  describe('getDocument', () => {
    it('should call collection.findOne with correct parameters and return document', async () => {
      const documentId = 'testId';
      const mockDoc: ParentDocument = { _id: documentId, content: 'Test Content' };
      mockFindOne.mockResolvedValueOnce(mockDoc);
      jest.spyOn(mongoService, 'getParentDocumentCollection').mockResolvedValueOnce(mockCollection() as any);

      const result = await mongoService.getDocument(documentId);

      expect(mongoService.getParentDocumentCollection).toHaveBeenCalledTimes(1);
      expect(mockFindOne).toHaveBeenCalledWith({ _id: documentId });
      expect(result).toEqual(mockDoc);
    });

    it('should return null if document is not found', async () => {
      const documentId = 'nonExistentId';
      mockFindOne.mockResolvedValueOnce(null);
      jest.spyOn(mongoService, 'getParentDocumentCollection').mockResolvedValueOnce(mockCollection() as any);

      const result = await mongoService.getDocument(documentId);

      expect(mongoService.getParentDocumentCollection).toHaveBeenCalledTimes(1);
      expect(mockFindOne).toHaveBeenCalledWith({ _id: documentId });
      expect(result).toBeNull();
    });
  });

  describe('deleteDocument', () => {
    it('should call collection.deleteOne with correct parameters', async () => {
      const documentId = 'testId';
      jest.spyOn(mongoService, 'getParentDocumentCollection').mockResolvedValueOnce(mockCollection() as any);

      await mongoService.deleteDocument(documentId);

      expect(mongoService.getParentDocumentCollection).toHaveBeenCalledTimes(1);
      expect(mockDeleteOne).toHaveBeenCalledWith({ _id: documentId });
    });
  });
});
