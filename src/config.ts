import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
	geminiApiKey: process.env.GEMINI_API_KEY!,
	geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
	openaiApiKey: process.env.OPENAI_API_KEY!,
	openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
	port: process.env.PORT || 8000,
	ragApiKey: process.env.RAG_API_KEY!,
	chromaUrl: process.env.CHROMA_URL!,
	chromaTenant: process.env.CHROMA_TENANT || 'default_tenant',
	chromaDatabase: process.env.CHROMA_DATABASE || 'default_database',
	chromaAuthToken: process.env.CHROMA_AUTH_TOKEN,
	chromaUsername: process.env.CHROMA_USERNAME,
	chromaPassword: process.env.CHROMA_PASSWORD,
};
