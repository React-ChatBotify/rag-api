import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
	// Server Configuration
	port: process.env.PORT || 8080,

	// RAG Management API Key (protects management endpoints)
	ragApiKey: process.env.RAG_MANAGEMENT_API_KEY!,
	ragQueryApiKey: process.env.RAG_QUERY_API_KEY!,

	// Gemini Configuration
	geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
	geminiApiKey: process.env.GEMINI_API_KEY!,
	geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
	geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash-lite',

	// ChromaDB Configuration
	chromaUrl: process.env.CHROMA_URL || 'chromadb',
	chromaPort: process.env.CHROMA_PORT || '8000',

	// MongoDB
	MONGODB_DATABASE_NAME: process.env.MONGO_INITDB_DATABASE || 'rcb-rag-api',
	MONGODB_URI: `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@mongodb:${process.env.MONGO_INITDB_PORT}/${process.env.MONGO_INITDB_DATABASE}?authSource=admin`,
	chromaTenant: process.env.CHROMA_TENANT || 'default_tenant',
	chromaDatabase: process.env.CHROMA_DATABASE || 'default_database',
	chromaAuthToken: process.env.CHROMA_AUTH_TOKEN,
};
