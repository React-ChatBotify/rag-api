// src/swagger/ragManagement.ts

const API_VERSION = process.env.API_VERSION || 'v1';

const ragManagementPaths = {
  [`/api/${API_VERSION}/rag/manage/documents`]: {
    post: {
      summary: 'Create a new document in the RAG system.',
      tags: ['RAG Management'],
      security: [{ ApiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                documentId: {
                  type: 'string',
                  description: 'Unique identifier for the document (e.g., filename or a unique ID).',
                  example: 'my-document-123',
                },
                markdownFile: {
                  type: 'string',
                  format: 'binary',
                  description: 'The Markdown file to upload.',
                },
              },
              required: ['documentId', 'markdownFile'],
            },
          },
        },
      },
      responses: {
        '201': { description: 'Document added successfully.' },
        '400': { description: 'Bad Request: Invalid input.' },
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '500': { description: 'Internal Server Error.' },
      },
    },
  },
  [`/api/${API_VERSION}/rag/manage/documents/{documentId}`]: {
    get: {
      summary: 'Retrieve a document by its ID.',
      tags: ['RAG Management'],
      security: [{ ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'documentId',
          in: 'path',
          required: true,
          description: 'Identifier of the document to retrieve.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Successful retrieval of document content.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  documentId: { type: 'string' },
                  content: {
                    type: 'string',
                    description: 'The full markdown content of the document.',
                  },
                },
              },
            },
          },
        },
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '404': { description: 'Not Found: Document not found.' },
        '500': { description: 'Internal Server Error.' },
      },
    },
    put: {
      summary: 'Update an existing document.',
      tags: ['RAG Management'],
      security: [{ ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'documentId',
          in: 'path',
          required: true,
          description: 'Identifier of the document to update.',
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            // Consistent with POST
            schema: {
              type: 'object',
              properties: {
                // documentId is in path, so not needed here again unless we want to allow changing it (unusual for PUT)
                markdownFile: {
                  type: 'string',
                  format: 'binary',
                  description: 'The new Markdown file to replace the existing document.',
                },
              },
              required: ['markdownFile'],
            },
          },
        },
      },
      responses: {
        '200': { description: 'Document updated successfully.' },
        '400': { description: 'Bad Request: Invalid input.' },
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '404': { description: 'Not Found: Document not found.' },
        '500': { description: 'Internal Server Error.' },
      },
    },
    delete: {
      summary: 'Delete a document by its ID.',
      tags: ['RAG Management'],
      security: [{ ApiKeyAuth: [] }],
      parameters: [
        {
          name: 'documentId',
          in: 'path',
          required: true,
          description: 'Identifier of the document to delete.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': { description: 'Document deleted successfully.' },
        // "204": { description: "Document deleted successfully (No Content)." }, // Alternative
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '404': { description: 'Not Found: Document not found (or already deleted).' },
        '500': { description: 'Internal Server Error.' },
      },
    },
  },
  [`/api/${API_VERSION}/rag/manage/documents:all`]: {
    get: {
      summary: 'Get all document IDs',
      tags: ['RAG Management'],
      security: [{ ApiKeyAuth: [] }],
      responses: {
        '200': {
          description: 'Successful retrieval of all document IDs.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  documentIds: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['doc-abc-123', 'doc-def-456'],
                  },
                },
              },
            },
          },
        },
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '503': { description: 'Service Unavailable: RAG service is not ready.' },
        '500': { description: 'Internal Server Error.' },
      },
    },
    // Note: Based on the router, a POST operation to this path also exists.
    // Its definition should be added here if it's different from POST /rag/manage/documents.
  },
};

export default ragManagementPaths;
