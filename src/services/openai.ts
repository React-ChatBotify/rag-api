import { config } from '../config';
import {
  OpenAIEmbeddingsPayload,
  OpenAIEmbeddingsResponse,
  OpenAIChatCompletionRequestPayload,
  OpenAIChatCompletionResponse,
  OpenAIChatCompletionChunk,
} from '../types';

const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

/**
 * Sends a streaming chat completion request to the OpenAI API via raw fetch
 * and processes the Server-Sent Events (SSE) stream manually.
 *
 * @param payload request payload for OpenAI's chat completion endpoint (must include model, messages).
 * @param onChunk callback function called for each parsed SSE data chunk received from OpenAI.
 *
 * @throws Will throw an error if the OpenAI API response is not successful or if the response stream is missing.
 */
const fetchOpenaiResponse = async (
	payload: OpenAIChatCompletionRequestPayload,
	onChunk?: (chunk: OpenAIChatCompletionChunk) => void,
	organizationId?: string
): Promise<void | OpenAIChatCompletionResponse> => {
	if (!config.openaiApiKey) {
		throw new Error('OpenAI API key is not configured.');
	}

	const headers: Record<string, string> = {
		Authorization: `Bearer ${config.openaiApiKey}`,
		'Content-Type': 'application/json',
	};
	if (organizationId) {
		headers['OpenAI-Organization'] = organizationId;
	}

	const url = `${OPENAI_API_BASE_URL}/chat/completions`;

	const response = await fetch(url, {
		body: JSON.stringify(payload),
		headers,
		method: 'POST',
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
	}

	if (payload.stream) {
		const reader = response.body!.getReader();
		const decoder = new TextDecoder('utf-8');
		let buffer = '';

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop()!;

			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith('data: ')) {
					const jsonData = trimmed.substring('data: '.length);
					if (jsonData === '[DONE]') {
						continue;
					}
					try {
						const chunk = JSON.parse(jsonData) as OpenAIChatCompletionChunk;
						if (onChunk) {
							onChunk(chunk);
						}
					} catch (error) {
						console.error('Failed to parse OpenAI stream chunk:', error, jsonData);
						// Potentially re-throw or handle more gracefully
					}
				}
			}
		}
		return; // For stream, explicitly return void
	} else {
		const json = await response.json();
		return json as OpenAIChatCompletionResponse;
	}
};

const getOpenaiEmbedding = async (payload: OpenAIEmbeddingsPayload): Promise<OpenAIEmbeddingsResponse> => {
	if (!config.openaiApiKey) {
		throw new Error('OpenAI API key is not configured.');
	}

	const url = `${OPENAI_API_BASE_URL}/embeddings`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${config.openaiApiKey}`,
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorBody = await response.text();
		console.error(`OpenAI API error (Embeddings): ${response.status} ${response.statusText}`, errorBody);
		throw new Error(`OpenAI API request failed (Embeddings): ${response.status} ${errorBody}`);
	}

	const data = await response.json();
	// It's good practice to validate the structure of 'data' against OpenAIEmbeddingsResponse
	// For now, we'll cast, assuming the API conforms.
	return data as OpenAIEmbeddingsResponse;
};

export { fetchOpenaiResponse, getOpenaiEmbedding };
