export type GeminiEmbeddingModel = 'text-embedding-004' | 'embedding-001'; // Note: API expects 'models/embedding-001'

export type GeminiPart = {
  text: string;
  // Potentially `inlineData?: { mimeType: string; data: string; }` if handling multimodal
};

export type GeminiContent = {
  parts: GeminiPart[];
  role?: 'user' | 'model';
};

export type GeminiEmbeddingsRequestItem = {
  model: string; // e.g., 'models/text-embedding-004'
  content: GeminiContent;
  task_type?: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
  title?: string; // For 'RETRIEVAL_DOCUMENT'
  output_dimensionality?: number;
};

export type GeminiBatchEmbeddingsRequest = {
  requests: GeminiEmbeddingsRequestItem[];
};

export type GeminiEmbedding = {
  model: string; // Full model name, e.g., "models/embedding-001"
  values: number[];
  task_type?: string;
  title?: string;
  output_dimensionality?: number;
};

export type GeminiBatchEmbeddingsResponse = {
  embeddings: GeminiEmbedding[];
};

export type GeminiChatModel = 'gemini-2.0-flash-lite' | 'gemini-1.0-pro' | 'gemini-1.5-flash'; // Note: API expects 'models/gemini-2.0-flash-lite'

export type GeminiSafetyRating = {
  category: string; // e.g., 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  probability: 'NEGLIGIBLE' | 'LOW' | 'MEDIUM' | 'HIGH';
};

export type GeminiPromptFeedback = {
  blockReason?: string;
  safetyRatings?: GeminiSafetyRating[];
};

export type GeminiCandidate = {
  content: GeminiContent; // Output content
  finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
  index: number;
  safetyRatings?: GeminiSafetyRating[];
  citationMetadata?: { citationSources: any[] }; // Define more strictly if needed
  tokenCount?: number;
};

// For streaming, the response is a stream of these objects, each potentially with one candidate.
export type GeminiChatCompletionResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: GeminiPromptFeedback;
};

export type GeminiChatGenerationConfig = {
  candidateCount?: number;
  stopSequences?: string[];
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
};

export type GeminiChatPayload = {
  contents: GeminiContent[]; // Note: Gemini API uses `contents` not `messages`
  generationConfig?: GeminiChatGenerationConfig;
  safetySettings?: any[]; // Define more strictly if needed
  tools?: any[]; // Define more strictly if needed
  toolConfig?: any; // Define more strictly if needed
  // `model` is part of the URL for Gemini, not typically in the payload body for generateContent.
};

export type GeminiQueryRequest = {
  contents: GeminiContent[];
};
