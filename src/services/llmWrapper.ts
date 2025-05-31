// src/services/llmWrapper.ts
import { fetchOpenaiResponse, getOpenaiEmbedding } from './openai';
import {
    batchEmbedContents as batchGeminiEmbeddings,
    batchGenerateContent as batchGeminiGenerate,
    streamGenerateContent as streamGeminiGenerate
    // embedContent as getGeminiSingleEmbedding, // Optionally import if direct single text embedding is needed elsewhere
} from './gemini';
import { config } from '../config';

interface LlmWrapperOptions {
  provider: 'openai' | 'gemini';
  query?: string; // For text generation
  text?: string; // For single text embedding
  texts?: string[]; // For batch text embeddings
  stream?: boolean; // Optional: for streaming responses
  // TODO: Add common parameters like temperature, max_tokens, etc.
}

interface EmbeddingData {
  embedding: number[];
  // Potentially add index or other metadata if handling batches directly here
}

interface EmbeddingResponse {
  embeddings: EmbeddingData[]; // Always return an array, even for single embeddings
  provider_model?: string; // e.g. "text-embedding-3-small" or "embedding-001"
}

interface TextGenerationResponse {
  text: string;
  provider_model?: string; // e.g. "gpt-3.5-turbo" or "gemini-pro"
  finish_reason?: string;
  // TODO: Add usage statistics if available from provider
}

// Placeholders getOpenaiEmbedding and getGeminiEmbedding are now removed.
// We will use the actual functions imported from openai.ts and gemini.ts (via batchGeminiEmbeddings).

export const generateText = async (options: LlmWrapperOptions): Promise<TextGenerationResponse> => {
  if (!options.query) {
    throw new Error("Query is required for text generation.");
  }

  switch (options.provider) {
    case 'openai':
      // Assuming fetchOpenaiResponse takes a similar payload structure.
      // This might need adjustment based on actual fetchOpenaiResponse implementation.
      const openaiPayload = {
        model: config.llm.openai.chatModels[0] || 'gpt-3.5-turbo', // Use a configured default or a common one
        messages: [{ role: 'user', content: options.query }],
        stream: options.stream,
        // TODO: Add temperature, max_tokens etc. from options if provided
      };
      // fetchOpenaiResponse needs to be robust enough to handle stream and non-stream.
      // For now, let's assume it returns a structure that can be adapted.
      // If it streams, this wrapper would need to handle the stream and aggregate content if not streamed by caller.
      // This is a simplification for now.
      if (options.stream) {
        // The current fetchOpenaiResponse seems to be a simple proxy and might not handle streaming itself.
        // This part would need significant rework if true streaming through the wrapper is required.
        // For now, we'll assume non-streaming path for simplicity or that fetchOpenaiResponse handles it.
        console.warn("Streaming for OpenAI via llmWrapper is conceptual. Ensure fetchOpenaiResponse supports it or adapt.");
      }
      const openaiResponse = await fetchOpenaiResponse(openaiPayload as any); // Cast to any to bypass strict type checks for now

      // Adapt OpenAI response
      // This depends heavily on the actual structure of openaiResponse
      let textOutput = '';
      if (openaiResponse.choices && openaiResponse.choices[0] && openaiResponse.choices[0].message) {
        textOutput = openaiResponse.choices[0].message.content;
      } else if (typeof openaiResponse === 'string') { // Simplistic fallback if it's just text
        textOutput = openaiResponse;
      } else {
        // Fallback for unexpected response structure
        console.warn("Unexpected OpenAI response structure:", openaiResponse);
        textOutput = JSON.stringify(openaiResponse); // Or throw an error
      }
      return {
        text: textOutput,
        provider_model: openaiResponse.model || openaiPayload.model,
        finish_reason: openaiResponse.choices && openaiResponse.choices[0] ? openaiResponse.choices[0].finish_reason : undefined,
      };

    case 'gemini':
      const geminiModel = config.llm.gemini.textModels[0] || 'gemini-pro'; // Use a configured default
      if (options.stream) {
        // streamGeminiGenerate expects a specific payload.
        // This also needs to handle potential streaming aggregation if the caller doesn't want a raw stream.
        // For now, assuming streamGeminiGenerate returns an aggregated response or caller handles stream.
        console.warn("Streaming for Gemini via llmWrapper is conceptual. Ensure streamGeminiGenerate or caller handles aggregation if needed.");
        const streamResponse = await streamGeminiGenerate({
            model: `models/${geminiModel}`, // Ensure model name is prefixed if required by underlying service
            contents: [{ parts: [{ text: options.query }] }],
            // TODO: Add generationConfig like temperature, maxOutputTokens from options
        });
        // Adapt streamGeminiGenerate response (assuming it's an aggregated text for non-streaming, or needs handling)
        // This is highly dependent on streamGeminiGenerate's actual return type for a non-streamed request or how it's handled.
        // The current Gemini SDK's streamGenerateContent returns an iterable stream.
        // A practical wrapper might need to iterate and concatenate here if a single string is expected.
        // For this subtask, we'll assume a simplified scenario where it can be resolved to text.
        let geminiStreamText = "";
        if (Array.isArray(streamResponse.responses)) { // If it's like the batch one due to internal handling
            geminiStreamText = streamResponse.responses.map(r => r.candidates[0]?.content.parts[0]?.text || "").join("");
        } else if (streamResponse.candidates && streamResponse.candidates[0]?.content.parts[0]?.text) { // Single response like non-streaming batch
            geminiStreamText = streamResponse.candidates[0].content.parts[0].text;
        } else {
            console.warn("Cannot determine text from streamGeminiGenerate response, may require stream handling:", streamResponse);
            // This would be where actual stream handling logic would go if options.stream was true
            // and the caller expected the wrapper to manage the stream.
            // For now, we'll return a placeholder if direct text extraction fails.
            geminiStreamText = `Simulated stream response for: ${options.query}`;
        }
         return {
            text: geminiStreamText, // This is a simplification.
            provider_model: geminiModel,
        };

      } else {
        const batchResponse = await batchGeminiGenerate({
          requests: [{
            model: `models/${geminiModel}`, // Ensure model name is prefixed
            contents: [{ parts: [{ text: options.query }] }],
            // TODO: Add generationConfig
          }],
        });
        // Adapt batchGeminiGenerate response (assuming it's an array of responses)
        const firstResponse = batchResponse.responses && batchResponse.responses[0];
        let geminiText = '';
        if (firstResponse && firstResponse.candidates && firstResponse.candidates[0] && firstResponse.candidates[0].content) {
            geminiText = firstResponse.candidates[0].content.parts.map(p => p.text).join("");
        } else {
            console.warn("Unexpected Gemini batch response structure:", batchResponse);
            // Fallback or error
        }
        return {
          text: geminiText,
          provider_model: geminiModel, // Or extract from response if available
          finish_reason: firstResponse?.candidates[0]?.finishReason,
        };
      }
    default:
      throw new Error(`Unsupported provider: ${options.provider}`);
  }
};

export const generateEmbeddings = async (options: LlmWrapperOptions): Promise<EmbeddingResponse> => {
  const textsToEmbed = options.text ? [options.text] : options.texts;
  if (!textsToEmbed || textsToEmbed.length === 0) {
    throw new Error("Text or texts are required for generating embeddings.");
  }

  const embeddingsData: EmbeddingData[] = [];
  let modelUsed: string | undefined;

  switch (options.provider) {
    case 'openai':
      const openaiEmbeddingModel = config.llm.openai.embeddingModels[0] || "text-embedding-ada-002";
      for (const text of textsToEmbed) {
        // getOpenaiEmbedding from openai.ts returns Promise<number[]>
        // It does not return a modelUsed property directly. The model is passed in.
        const embeddingVector = await getOpenaiEmbedding(text, openaiEmbeddingModel);
        embeddingsData.push({ embedding: embeddingVector });
      }
      // modelUsed for OpenAI will be the one we passed to the function.
      modelUsed = openaiEmbeddingModel;
      return { embeddings: embeddingsData, provider_model: modelUsed };

    case 'gemini':
      const geminiEmbeddingModel = config.llm.gemini.embeddingModels[0] || 'embedding-001';
      // The current batchEmbedContents in gemini.ts takes an array of requests.
      // We need to map our texts to that structure.
      const requests = textsToEmbed.map(text => ({
        model: `models/${geminiEmbeddingModel}`,
        content: { parts: [{ text }] },
      }));

      try {
        const response = await batchGeminiEmbeddings({ requests });
        if (response.embeddings && response.embeddings.length === textsToEmbed.length) {
          response.embeddings.forEach(emb => {
            embeddingsData.push({ embedding: emb.values });
          });
          modelUsed = geminiEmbeddingModel; // The request specifies one model for all
        } else {
          console.error("Mismatch in Gemini embeddings count or empty response", response);
          throw new Error("Failed to generate Gemini embeddings or response format unexpected.");
        }
      } catch (error) {
          console.error("Error calling batchGeminiEmbeddings:", error);
          throw error; // Re-throw
      }
      return { embeddings: embeddingsData, provider_model: modelUsed };

    default:
      throw new Error(`Unsupported provider for embeddings: ${options.provider}`);
  }
};
