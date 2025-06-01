import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
	// Server Configuration
	port: process.env.PORT || 8080,

	// RAG Service API Key (protects management endpoints)
	ragApiKey: process.env.RAG_API_KEY!,

	// OpenAI Configuration
	openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
	openaiApiKey: process.env.OPENAI_API_KEY!,
	openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
	openAiChatModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4.1-nano',

	// Gemini Configuration
	geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
	geminiApiKey: process.env.GEMINI_API_KEY!,
	geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
	geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash-lite',

	// ChromaDB Configuration
	chromaUrl: process.env.CHROMA_URL || 'chromadb',
	chromaPort: process.env.CHROMA_PORT || '8000',
	chromaTenant: process.env.CHROMA_TENANT || 'default_tenant',
	chromaDatabase: process.env.CHROMA_DATABASE || 'default_database',
	chromaAuthToken: process.env.CHROMA_AUTH_TOKEN,

	// MongoDB Configuration
	mongoDbUri: process.env.MONGODB_URI!, // e.g., mongodb://localhost:27017
	mongoDbName: process.env.MONGODB_NAME || 'rag_parent_documents',
};
