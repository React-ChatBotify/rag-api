import { Request, Response } from 'express';

import { initializedRagService } from '../../services/ragService';
import { createDocument, deleteDocument, getDocument, getAllDocuments, updateDocument } from '../ragManagement'; // Adjust path as needed

// Mock the initializedRagService
jest.mock('../../services/ragService', () => ({
  initializedRagService: Promise.resolve({
    addDocument: jest.fn(),
    deleteDocument: jest.fn(),
    getParentDocumentContent: jest.fn(),
    updateDocument: jest.fn(),
    getAllDocumentIds: jest.fn(), // Added mock for getAllDocumentIds
    // Add other methods if they are called and need mocking, e.g. documentExists
  }),
}));

// Helper to create mock Express req/res objects
const mockRequest = (body: any = {}, params: any = {}): Partial<Request> => ({
  body,
  params,
});

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res); // For error cases that might use send
  return res;
};

describe('RAG Management Controllers', () => {
  let mockRagService: any;

  beforeEach(async () => {
    // Reset mocks before each test
    jest.clearAllMocks();
    mockRagService = await initializedRagService; // Get the mocked service
  });

  describe('createDocument', () => {
    it('should create a document successfully and return 201', async () => {
      const req = mockRequest({ documentId: 'doc1', markdownContent: 'content' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.addDocument.mockResolvedValue(undefined);

      await createDocument(req, res);

      expect(mockRagService.addDocument).toHaveBeenCalledWith('doc1', 'content');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ documentId: 'doc1', message: 'Document added successfully' });
    });

    it('should return 400 if documentId is missing', async () => {
      const req = mockRequest({ markdownContent: 'content' }) as Request;
      const res = mockResponse() as Response;
      await createDocument(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request: documentId is required and must be a non-empty string.',
      });
    });

    it('should return 400 if markdownContent is missing', async () => {
      const req = mockRequest({ documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      await createDocument(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request: markdownContent is required and must be a string.',
      });
    });

    it('should return 500 if ragService.addDocument fails', async () => {
      const req = mockRequest({ documentId: 'doc1', markdownContent: 'content' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.addDocument.mockRejectedValue(new Error('Service error'));

      await createDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ details: 'Service error', error: 'Internal Server Error' });
    });
    it('should return 503 if RAG service not initialized (specific error check)', async () => {
      const req = mockRequest({ documentId: 'doc1', markdownContent: 'content' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.addDocument.mockRejectedValue(new Error('ChromaDB collection is not initialized.'));

      await createDocument(req, res);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service Unavailable: RAG service is not ready.' });
    });
  });

  describe('getDocument', () => {
    it('should get a document successfully and return 200', async () => {
      const req = mockRequest({}, { documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.getParentDocumentContent.mockResolvedValue('Some content');

      await getDocument(req, res);

      expect(mockRagService.getParentDocumentContent).toHaveBeenCalledWith('doc1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ content: 'Some content', documentId: 'doc1' });
    });

    it('should return 404 if document not found', async () => {
      const req = mockRequest({}, { documentId: 'doc-nonexistent' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.getParentDocumentContent.mockResolvedValue(null);

      await getDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Not Found: Document not found.' });
    });

    it('should return 400 if documentId parameter is missing', async () => {
      const req = mockRequest({}, {}) as Request; // No documentId in params
      const res = mockResponse() as Response;
      await getDocument(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Bad Request: documentId parameter is required.' });
    });

    it('should return 500 if ragService.getParentDocumentContent fails', async () => {
      const req = mockRequest({}, { documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.getParentDocumentContent.mockRejectedValue(new Error('Service error'));

      await getDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ details: 'Service error', error: 'Internal Server Error' });
    });
  });

  describe('updateDocument', () => {
    it('should update a document successfully and return 200', async () => {
      const req = mockRequest({ markdownContent: 'new content' }, { documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.updateDocument.mockResolvedValue(undefined);

      await updateDocument(req, res);

      expect(mockRagService.updateDocument).toHaveBeenCalledWith('doc1', 'new content');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ documentId: 'doc1', message: 'Document updated successfully' });
    });

    it('should return 400 if documentId parameter is missing', async () => {
      const req = mockRequest({ markdownContent: 'new content' }, {}) as Request;
      const res = mockResponse() as Response;
      await updateDocument(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Bad Request: documentId parameter is required.' });
    });

    it('should return 400 if markdownContent is missing in body', async () => {
      const req = mockRequest({}, { documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      await updateDocument(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Bad Request: markdownContent is required in the body and must be a string.',
      });
    });

    it('should return 500 if ragService.updateDocument fails', async () => {
      const req = mockRequest({ markdownContent: 'new content' }, { documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.updateDocument.mockRejectedValue(new Error('Service error'));

      await updateDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ details: 'Service error', error: 'Internal Server Error' });
    });
  });

  describe('deleteDocument', () => {
    it('should delete a document successfully and return 200', async () => {
      const req = mockRequest({}, { documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.deleteDocument.mockResolvedValue(undefined);

      await deleteDocument(req, res);

      expect(mockRagService.deleteDocument).toHaveBeenCalledWith('doc1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        documentId: 'doc1',
        message: 'Document deleted successfully (or did not exist)',
      });
    });

    it('should return 400 if documentId parameter is missing', async () => {
      const req = mockRequest({}, {}) as Request;
      const res = mockResponse() as Response;
      await deleteDocument(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Bad Request: documentId parameter is required.' });
    });

    it('should return 500 if ragService.deleteDocument fails', async () => {
      const req = mockRequest({}, { documentId: 'doc1' }) as Request;
      const res = mockResponse() as Response;
      mockRagService.deleteDocument.mockRejectedValue(new Error('Service error'));

      await deleteDocument(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ details: 'Service error', error: 'Internal Server Error' });
    });
  });

  describe('getAllDocuments', () => {
    it('should return 200 and all document IDs', async () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      const expectedIds = ['id1', 'id2'];
      mockRagService.getAllDocumentIds.mockResolvedValue(expectedIds);

      await getAllDocuments(req, res);

      expect(mockRagService.getAllDocumentIds).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ documentIds: expectedIds });
    });

    it('should return 200 and an empty array if no documents exist', async () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      mockRagService.getAllDocumentIds.mockResolvedValue([]);

      await getAllDocuments(req, res);

      expect(mockRagService.getAllDocumentIds).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ documentIds: [] });
    });

    it('should return 503 if RAG service is not ready', async () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      mockRagService.getAllDocumentIds.mockRejectedValue(new Error('ChromaDB collection is not initialized'));

      await getAllDocuments(req, res);

      expect(mockRagService.getAllDocumentIds).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: 'Service Unavailable: RAG service is not ready.' });
    });

    it('should return 500 for other errors', async () => {
      const req = mockRequest() as Request;
      const res = mockResponse() as Response;
      mockRagService.getAllDocumentIds.mockRejectedValue(new Error('Something went wrong'));

      await getAllDocuments(req, res);

      expect(mockRagService.getAllDocumentIds).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error', details: 'Something went wrong' });
    });
  });
});
