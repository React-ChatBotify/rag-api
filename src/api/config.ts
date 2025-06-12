import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  // MongoDB
  MONGODB_DATABASE_NAME: process.env.MONGO_INITDB_DATABASE || 'rcb-rag-api',

  MONGODB_URI: `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@mongodb:${process.env.MONGO_INITDB_PORT}/${process.env.MONGO_INITDB_DATABASE}?authSource=admin`,

  // ChromaDB Configuration
  chromaAuthToken: process.env.CHROMA_AUTH_TOKEN,

  chromaDatabase: process.env.CHROMA_DATABASE || 'default_database',

  chromaPort: process.env.CHROMA_PORT || '8000',

  chromaTenant: process.env.CHROMA_TENANT || 'default_tenant',

  chromaUrl: process.env.CHROMA_URL || 'chromadb',

  // Gemini Configuration
  geminiApiKey: process.env.GEMINI_API_KEY!,

  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',

  geminiChatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.0-flash-lite',

  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',

  geminiNResults: parseInt(process.env.GEMINI_N_RESULTS || '3', 10),

  geminiRagType: process.env.GEMINI_RAG_TYPE || 'basic',

  geminiSystemPrompt:
    process.env.GEMINI_SYSTEM_PROMPT ||
    'You are a helpful assistant for React ChatBotify, a React library for building flexible and extensible chatbots.',

  // Server Configuration
  port: process.env.PORT || 8080,

  ragConversationWindowSize: parseInt(process.env.RAG_CONVERSATION_WINDOW_SIZE || '', 10) || 1,

  // RAG Management API Key (protects management endpoints)
  ragManagementApiKey: process.env.RAG_MANAGEMENT_API_KEY!,

  ragQueryApiKey: process.env.RAG_QUERY_API_KEY!,
};
