const swaggerDocument = {
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        description: 'API Key for accessing protected endpoints.',
        in: 'header',
        name: 'X-API-KEY',
        type: 'apiKey',
      },
    },
  },
  info: {
    description: 'API documentation for the LLM Proxy service, including RAG management and query endpoints.',
    title: 'LLM Proxy API Documentation with RAG',
    version: '1.0.0',
  },
  openapi: '3.1.0',
};

export default swaggerDocument;
