// src/swagger/ragManagement.ts

const API_VERSION = process.env.API_VERSION || 'v1';

const ragManagementPaths = {
  [`/api/${API_VERSION}/rag/manage/documents`]: {
    post: {
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: {
              properties: {
                documentId: {
                  description: 'Unique identifier for the document (e.g., filename or a unique ID).',
                  example: 'my-document-123',
                  type: 'string',
                },
                markdownFile: {
                  description: 'The Markdown file to upload.',
                  format: 'binary',
                  type: 'string',
                },
              },
              required: ['documentId', 'markdownFile'],
              type: 'object',
            },
          },
        },
        required: true,
      },
      responses: {
        '201': { description: 'Document added successfully.' },
        '400': { description: 'Bad Request: Invalid input.' },
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '500': { description: 'Internal Server Error.' },
      },
      security: [{ ApiKeyAuth: [] }],
      summary: 'Create a new document in the RAG system.',
      tags: ['RAG Management'],
    },
  },
  [`/api/${API_VERSION}/rag/manage/documents/{documentId}`]: {
    delete: {
      parameters: [
        {
          description: 'Identifier of the document to delete.',
          in: 'path',
          name: 'documentId',
          required: true,
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
      security: [{ ApiKeyAuth: [] }],
      summary: 'Delete a document by its ID.',
      tags: ['RAG Management'],
    },
    get: {
      parameters: [
        {
          description: 'Identifier of the document to retrieve.',
          in: 'path',
          name: 'documentId',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                properties: {
                  content: {
                    description: 'The full markdown content of the document.',
                    type: 'string',
                  },
                  documentId: { type: 'string' },
                },
                type: 'object',
              },
            },
          },
          description: 'Successful retrieval of document content.',
        },
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '404': { description: 'Not Found: Document not found.' },
        '500': { description: 'Internal Server Error.' },
      },
      security: [{ ApiKeyAuth: [] }],
      summary: 'Retrieve a document by its ID.',
      tags: ['RAG Management'],
    },
    put: {
      parameters: [
        {
          description: 'Identifier of the document to update.',
          in: 'path',
          name: 'documentId',
          required: true,
          schema: { type: 'string' },
        },
      ],
      requestBody: {
        content: {
          'multipart/form-data': {
            // Consistent with POST
            schema: {
              properties: {
                // documentId is in path, so not needed here again unless we want to allow changing it (unusual for PUT)
                markdownFile: {
                  description: 'The new Markdown file to replace the existing document.',
                  format: 'binary',
                  type: 'string',
                },
              },
              required: ['markdownFile'],
              type: 'object',
            },
          },
        },
        required: true,
      },
      responses: {
        '200': { description: 'Document updated successfully.' },
        '400': { description: 'Bad Request: Invalid input.' },
        '401': { description: 'Unauthorized: API key is missing or invalid.' },
        '404': { description: 'Not Found: Document not found.' },
        '500': { description: 'Internal Server Error.' },
      },
      security: [{ ApiKeyAuth: [] }],
      summary: 'Update an existing document.',
      tags: ['RAG Management'],
    },
  },
};

export default ragManagementPaths;
