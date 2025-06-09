const swaggerDocument = {
	info: {
		title: 'LLM Proxy API Documentation with RAG',
		version: '1.0.0',
		description: 'API documentation for the LLM Proxy service, including RAG management and query endpoints.'
	},
	openapi: '3.1.0',
	components: {
        securitySchemes: {
            "ApiKeyAuth": {
                type: "apiKey",
                in: "header",
                name: "X-API-Key",
                description: "API Key for accessing protected endpoints."
            }
        }
    }
};

export default swaggerDocument;
