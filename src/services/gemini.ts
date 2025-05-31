import { config } from '../config';
import {
	GeminiChatPayload, // Though not directly used as a single payload object for functions after refactor
	GeminiChatCompletionResponse,
	GeminiStreamChunk,
	GeminiBatchEmbeddingsRequest,
	GeminiBatchEmbeddingsResponse,
	GeminiContent,
	GeminiChatModel, // For typing model identifiers
	GeminiEmbeddingModel
} from '../types';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Helper to ensure model name is correctly prefixed
const ensureModelPrefixed = (modelId: string): string => {
	if (!modelId.startsWith('models/')) {
		return `models/${modelId}`;
	}
	return modelId;
};

/**
 * Sends a streaming chat completion request to the Gemini API via raw fetch
 * and processes the Server-Sent Events (SSE) stream manually.
 *
 * @param modelId The model identifier (e.g., 'gemini-2.0-flash-lite').
 * @param contents The content parts for the chat.
 * @param onChunk callback function called for each parsed SSE data chunk received from Gemini.
 *
 * @throws throw an error if the Gemini API response is not successful or if the response stream is missing.
 */
const streamGemini = async (
	modelId: GeminiChatModel | string,
	contents: GeminiContent[],
	onChunk: (chunk: GeminiStreamChunk) => void
): Promise<void> => {
	if (!config.geminiApiKey) {
		throw new Error('Gemini API key is not configured.');
	}

	const url =
		`${GEMINI_API_BASE_URL}/models/${config.geminiChatModel}:streamGenerateContent` +
		`?alt=sse&key=${config.geminiApiKey}`;

	const bodyPayload: { contents: GeminiContent[] } = { contents };

	const response = await fetch(url, {
		body: JSON.stringify(bodyPayload),
		headers: {
			'Content-Type': 'application/json',
		},
		method: 'POST',
	});

	if (!response.ok || !response.body) {
		const errorText = await response.text();
		throw new Error(`Gemini API error ${response.status}: ${errorText}`);
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder('utf-8');
	let buffer = '';

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop()!; // Keep the last partial line in buffer

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (trimmedLine.startsWith('data: ')) {
				const jsonData = trimmedLine.substring('data: '.length);
				try {
					const chunk = JSON.parse(jsonData) as GeminiStreamChunk;
					onChunk(chunk);
				} catch (error) {
					console.error('Failed to parse Gemini stream chunk:', error, jsonData);
					// Decide on error handling: re-throw, or pass error to onChunk, or ignore.
				}
			}
		}
	}
};

/**
 * Sends a batch chat completion request to the Gemini API.
 *
 * @param modelId The model identifier (e.g., 'gemini-2.0-flash-lite').
 * @param contents The content parts for the chat.
 *
 * @throws throw an error if the Gemini API response is not successful.
 */
const batchGemini = async (
	modelId: GeminiChatModel | string,
	contents: GeminiContent[]
): Promise<GeminiChatCompletionResponse> => {
	if (!config.geminiApiKey) {
		throw new Error('Gemini API key is not configured.');
	}

	// Use the provided modelId, not config.geminiChatModel directly, for flexibility
	const url =
		`${GEMINI_API_BASE_URL}/models/${config.geminiChatModel}:generateContent` +
		`?key=${config.geminiApiKey}`;

		console.log(url);

	const bodyPayload: { contents: GeminiContent[] } = { contents };

	const response = await fetch(url, {
		body: JSON.stringify(bodyPayload),
		headers: {
			'Content-Type': 'application/json',
		},
		method: 'POST',
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Gemini API error ${response.status}: ${errorText}`);
	}

	const jsonResponse = await response.json();
	return jsonResponse as GeminiChatCompletionResponse;
};

// Renaming for export clarity to match llmWrapper's expectations
const streamGenerateContent = streamGemini;
const batchGenerateContent = batchGemini;

const batchEmbedContents = async (payload: GeminiBatchEmbeddingsRequest): Promise<GeminiBatchEmbeddingsResponse> => {
    if (!config.geminiApiKey) {
        throw new Error('Gemini API key is not configured.');
    }

    // Ensure the model in the URL is prefixed.
    // config.geminiEmbeddingModel might be 'embedding-001' or 'models/embedding-001'
    // The actual individual embedding requests in payload.requests should already have their model names prefixed.
    const urlModelName = ensureModelPrefixed(config.geminiEmbeddingModel as string); // Cast needed if GeminiEmbeddingModel is a literal union

    const url = `${GEMINI_API_BASE_URL}/${urlModelName}:batchEmbedContents?key=${config.geminiApiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Gemini API error (batchEmbedContents): ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`Gemini API request failed (batchEmbedContents): ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    // Validate data structure against GeminiBatchEmbeddingsResponse if necessary,
    // for now, direct cast, assuming API conforms.
    return data as GeminiBatchEmbeddingsResponse;
};


export { batchGenerateContent, streamGenerateContent, batchEmbedContents };
