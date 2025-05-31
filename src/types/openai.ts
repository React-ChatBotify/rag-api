export type OpenAIEmbeddingModel =
  | 'text-embedding-3-small'
  | 'text-embedding-3-large'
  | 'text-embedding-ada-002';

export interface OpenAIEmbeddingsPayload {
  input: string | string[];
  model: OpenAIEmbeddingModel;
  encoding_format?: 'float' | 'base64';
  dimensions?: number;
  user?: string;
}

export interface OpenAIEmbedding {
  object: 'embedding';
  embedding: number[];
  index: number;
}

export interface OpenAIEmbeddingsResponse {
  object: 'list';
  data: OpenAIEmbedding[];
  model: OpenAIEmbeddingModel | string; // Or string if we want to be more flexible
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export type OpenAIChatModel = 'gpt-4' | 'gpt-3.5-turbo';

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // If role is 'tool' or 'assistant' with a tool call
  tool_calls?: any[]; // Define more strictly if tool usage is in scope
  tool_call_id?: string;
}

export interface OpenAIChatCompletionRequestPayload {
  messages: OpenAIChatMessage[];
  model: OpenAIChatModel | string;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
  top_logprobs?: number;
  max_tokens?: number;
  n?: number;
  presence_penalty?: number;
  response_format?: { type: 'text' | 'json_object' };
  seed?: number;
  stop?: string | string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  tools?: any[]; // Define more strictly if needed
  tool_choice?: any; // Define more strictly if needed
  user?: string;
}

export interface OpenAIChatCompletionChoice {
  finish_reason: string; // e.g., 'stop', 'length', 'tool_calls'
  index: number;
  message: OpenAIChatMessage;
  logprobs?: any; // Define more strictly if needed
}

export interface OpenAIChatCompletionResponse {
  id: string;
  choices: OpenAIChatCompletionChoice[];
  created: number; // Unix timestamp
  model: string; // Model ID
  system_fingerprint?: string;
  object: 'chat.completion';
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIChatCompletionChunkChoiceDelta {
  role?: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: any[]; // Define more strictly if needed
}

export interface OpenAIChatCompletionChunkChoice {
  delta: OpenAIChatCompletionChunkChoiceDelta;
  finish_reason?: string | null; // Changed to allow null based on OpenAI's actual API behavior
  index: number;
  logprobs?: any; // Define more strictly if needed
}

export interface OpenAIChatCompletionChunk {
  id: string;
  choices: OpenAIChatCompletionChunkChoice[];
  created: number;
  model: string;
  system_fingerprint?: string;
  object: 'chat.completion.chunk';
}
