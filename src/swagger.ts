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
    description: 'API documentation for React ChatBotify\'s RAG API service.',
    title: 'React ChatBotify RAG API Documentation',
    version: '1.0.0',
  },
  openapi: '3.1.0',
};

export default swaggerDocument;
