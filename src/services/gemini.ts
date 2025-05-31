import { config } from '../config';

const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Sends a streaming chat completion request to the Gemini API via raw fetch
 * and processes the Server-Sent Events (SSE) stream manually.
 *
 * @param payload request payload containing the `model` name and `contents`.
 * @param onChunk callback function called for each raw SSE data chunk received from Gemini.
 *
 * @throws throw an error if the Gemini API response is not successful or if the response stream is missing.
 */
const streamGemini = async (
	payload: { model: string; contents: any[] },
	onChunk: (line: string) => void
): Promise<void> => {
	const { model, contents } = payload;

	if (!config.geminiApiKey) {
		throw new Error('Gemini API key is not configured.');
	}

	console.log("CHECKPOINT 1");
	console.log({ contents });

	const url =
		`${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:streamGenerateContent` +
		`?alt=sse&key=${config.geminiApiKey}`;

	const response = await fetch(url, {
		body: JSON.stringify({ contents }),
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
		buffer = lines.pop()!;

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (trimmedLine.startsWith('data: ')) {
				onChunk(trimmedLine);
			}
		}
	}
};

/**
 * Sends a batch chat completion request to the Gemini API.
 *
 * @param payload request payload containing the `model` and `contents`.
 *
 * @throws throw an error if the Gemini API response is not successful.
 */
const batchGemini = async (payload: { model: string; contents: any[] }): Promise<any> => {
	const { contents } = payload;

	if (!config.geminiApiKey) {
		throw new Error('Gemini API key is not configured.');
	}

	const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(config.geminiChatModel)}:generateContent?key=${config.geminiApiKey}`;
	console.log(url);

	const response = await fetch(url, {
		body: JSON.stringify({ contents }),
		headers: {
			'Content-Type': 'application/json',
		},
		method: 'POST',
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Gemini API error ${response.status}: ${errorText}`);
	}

	return await response.json();
};

// Renaming for export clarity to match llmWrapper's expectations
const streamGenerateContent = streamGemini;
const batchGenerateContent = batchGemini;

/**
 * Generates embeddings for multiple pieces of text in a batch using the Gemini API.
 *
 * @param requests An array of requests, each specifying the model and content to embed.
 *                 Example: [{ model: "models/embedding-001", content: { parts: [{text: "hello"}] } }]
 * @returns An object containing the embeddings.
 */
interface BatchEmbedContentsRequest {
  requests: Array<{
    model: string; // Full model name, e.g., "models/embedding-001"
    content: {
      parts: Array<{ text: string }>;
      role?: string; // Optional: "USER" or "MODEL"
    };
  }>;
}

interface BatchEmbedContentsResponse {
  embeddings: Array<{
    model: string;
    values: number[];
  }>;
}

const batchEmbedContents = async (payload: BatchEmbedContentsRequest): Promise<BatchEmbedContentsResponse> => {
    if (!config.geminiApiKey) {
        throw new Error('Gemini API key is not configured.');
    }

    // The model is specified in each request object in the payload.
    // The endpoint itself does not take a model name directly in the URL path for batch.
    // However, the Gemini API documentation for batchEmbedContents shows POST /v1beta/models:batchEmbedContents
    // This implies the model is part of the request body, not the URL.
    // Let's use a generic model endpoint if the API expects it, or remove model from URL if not needed.
    // For safety, assuming a generic model endpoint for batch operation as per typical REST patterns if model is not in URL
    // Looking at Google AI JS SDK, it seems to be POST /v1beta/models:batchEmbedContents
    // The individual requests in the payload then specify their respective models.
    // The `payload.requests[0].model` would be like "models/embedding-001"
    // So the base model in the URL is not required.
    const url = `${GEMINI_API_BASE_URL}/models/${config.geminiEmbeddingModel}:batchEmbedContents?key=${config.geminiApiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload), // Send the whole payload { requests: [...] }
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Gemini API error (batchEmbedContents): ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`Gemini API request failed (batchEmbedContents): ${response.status} ${errorBody}`);
    }

    const data = await response.json();
    // Expected structure: { embeddings: [ { model: "models/embedding-001", values: [...] } ] }
    if (data.embeddings && Array.isArray(data.embeddings)) {
        return data;
    } else {
        console.error("Unexpected Gemini batch embedding response structure:", data);
        throw new Error("Failed to extract embeddings from Gemini batch response or response format unexpected.");
    }
};


export { batchGenerateContent, streamGenerateContent, batchEmbedContents };
