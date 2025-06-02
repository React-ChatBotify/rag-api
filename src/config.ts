import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
	// Server Configuration
	port: process.env.PORT || 8080,

	// RAG Service API Key (protects management endpoints)
	ragApiKey: process.env.RAG_API_KEY!,

	// Gemini Configuration
	geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
	geminiApiKey: process.env.GEMINI_API_KEY!,
	geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
	geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash-lite',

	// ChromaDB Configuration
	chromaUrl: process.env.CHROMA_URL || 'chromadb',
	chromaPort: process.env.CHROMA_PORT || '8000',

	// MongoDB
	MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
	MONGODB_DATABASE_NAME: process.env.MONGODB_DATABASE_NAME || 'rag_parent_documents',
	chromaTenant: process.env.CHROMA_TENANT || 'default_tenant',
	chromaDatabase: process.env.CHROMA_DATABASE || 'default_database',
	chromaAuthToken: process.env.CHROMA_AUTH_TOKEN,
};
