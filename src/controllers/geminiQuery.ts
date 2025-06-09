import { Request, Response } from 'express';

import { config } from '../config';
import { generateText } from '../services/llmWrapper';
import { initializedRagService } from '../services/ragService';
import { GeminiQueryRequest, LLMChatResponse, LLMStreamChunk } from '../types';

export const handleGeminiBatch = async (req: Request, res: Response) => {
  const model = req.params.model;
  let userQuery = ''; // Define userQuery here to be accessible in the catch block

  try {
    const { contents } = req.body as GeminiQueryRequest;

    // Validate contents structure
    if (
      !contents ||
      !Array.isArray(contents) ||
      contents.length === 0 ||
      !contents[0].parts ||
      !Array.isArray(contents[0].parts) ||
      contents[0].parts.length === 0 ||
      !contents[0].parts[0].text ||
      typeof contents[0].parts[0].text !== 'string' ||
      contents[0].parts[0].text.trim() === ''
    ) {
      return res.status(400).json({
        error:
          'Bad Request: contents is required and must be an array with at least one part containing a non-empty text string.',
      });
    }
    userQuery = contents[0].parts[0].text; // Assign userQuery after validation

    const rag_type = config.geminiRagType;
    const numberOfResults = config.geminiNResults;

    console.log(
      `INFO: Gemini Batch Request. Model: ${model}. RAG Type (from config): ${rag_type}. N Results (from config): ${numberOfResults}.`
    );

    const ragService = await initializedRagService;
    const chunks = await ragService.queryChunks(userQuery, numberOfResults);

    let augmentedPrompt: string;
    if (!chunks || chunks.length === 0) {
      console.warn(
        `No relevant chunks found for query: "${userQuery}" with model ${model}. Querying LLM directly without RAG context.`
      );
      augmentedPrompt = userQuery;
    } else {
      let contextContent: string[] = [];
      if (rag_type === 'advanced') {
        const uniqueParentContents = new Set<string>();
        chunks.forEach((chunk) => {
          if (chunk.metadata && typeof chunk.metadata.original_content === 'string') {
            uniqueParentContents.add(chunk.metadata.original_content);
          }
        });
        if (uniqueParentContents.size > 0) {
          contextContent = Array.from(uniqueParentContents);
        }
      } else {
        // rag_type === 'basic'
        chunks.forEach((chunk) => {
          if (chunk.metadata && typeof chunk.metadata.text_chunk === 'string') {
            contextContent.push(chunk.metadata.text_chunk);
          } else if (typeof chunk.document === 'string' && chunk.document.trim() !== '') {
            contextContent.push(chunk.document);
          }
        });
      }

      if (contextContent.length === 0) {
        console.warn(
          `Chunks were found for query "${userQuery}" (RAG Type from config: ${rag_type}, model: ${model}), but no relevant content could be extracted. Querying LLM directly.`
        );
        augmentedPrompt = userQuery;
      } else {
        const context = contextContent.join('\n---\n');
        const contextDescription =
          rag_type === 'advanced' ? 'Relevant Information from Parent Documents' : 'Relevant Text Chunks';
        augmentedPrompt = `User Query: ${userQuery}\n\n${contextDescription}:\n---\n${context}\n---\nBased on the relevant information above, answer the user query.`;
      }
    }

    // console.log(`INFO: Gemini Batch Request. Model: ${model}. RAG Type: ${rag_type}.`); // Already logged above with more details

    try {
      const llmResponse = (await generateText({
        model: model,
        query: augmentedPrompt,
        stream: false,
      })) as LLMChatResponse;
      res.status(200).json(llmResponse);
    } catch (llmError: any) {
      console.error(`Error calling llmWrapper for Gemini batch (model: ${model}):`, llmError);
      return res
        .status(500)
        .json({ details: llmError.message, error: `Failed to get response from LLM provider Gemini.` });
    }
  } catch (error: any) {
    console.error(`Error in handleGeminiBatch for model ${model}, query "${userQuery}":`, error); // Use userQuery for logging
    if (error.message && error.message.includes('ChromaDB collection is not initialized')) {
      return res.status(503).json({ error: 'Service Unavailable: RAG service is not ready.' });
    }
    if (error.message && error.message.includes('Failed to initialize embedding pipeline')) {
      return res.status(503).json({ error: 'Service Unavailable: Embedding model not ready.' });
    }
    return res.status(500).json({ details: error.message, error: 'Internal Server Error' });
  }
};

export const handleGeminiStream = async (req: Request, res: Response) => {
  const model = req.params.model;
  let userQuery = ''; // Define userQuery here to be accessible in the catch block

  try {
    const { contents } = req.body as GeminiQueryRequest;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // res.flushHeaders(); // Flush headers after initial validation

    // Validate contents structure
    if (
      !contents ||
      !Array.isArray(contents) ||
      contents.length === 0 ||
      !contents[0].parts ||
      !Array.isArray(contents[0].parts) ||
      contents[0].parts.length === 0 ||
      !contents[0].parts[0].text ||
      typeof contents[0].parts[0].text !== 'string' ||
      contents[0].parts[0].text.trim() === ''
    ) {
      // If headers not sent, can send 400
      if (!res.headersSent) {
        return res.status(400).json({
          error:
            'Bad Request: contents is required and must be an array with at least one part containing a non-empty text string.',
        });
      } else {
        // Headers sent, write error to stream
        res.write(
          `data: ${JSON.stringify({
            error:
              'Bad Request: contents is required and must be an array with at least one part containing a non-empty text string.',
          })}\n\n`
        );
        res.end();
        return;
      }
    }
    userQuery = contents[0].parts[0].text; // Assign userQuery after validation
    res.flushHeaders(); // Send headers now that initial validation passed

    const rag_type = config.geminiRagType;
    const numberOfResults = config.geminiNResults;

    console.log(
      `INFO: Gemini Stream Request. Model: ${model}. RAG Type (from config): ${rag_type}. N Results (from config): ${numberOfResults}.`
    );

    const ragService = await initializedRagService;
    const chunks = await ragService.queryChunks(userQuery, numberOfResults);

    let augmentedPrompt: string;
    if (!chunks || chunks.length === 0) {
      console.warn(
        `No relevant chunks found for query: "${userQuery}" with model ${model} (stream). Querying LLM directly without RAG context.`
      );
      augmentedPrompt = userQuery;
    } else {
      let contextContent: string[] = [];
      if (rag_type === 'advanced') {
        const uniqueParentContents = new Set<string>();
        chunks.forEach((chunk) => {
          if (chunk.metadata && typeof chunk.metadata.original_content === 'string') {
            uniqueParentContents.add(chunk.metadata.original_content);
          }
        });
        if (uniqueParentContents.size > 0) {
          contextContent = Array.from(uniqueParentContents);
        }
      } else {
        // rag_type === 'basic'
        chunks.forEach((chunk) => {
          if (chunk.metadata && typeof chunk.metadata.text_chunk === 'string') {
            contextContent.push(chunk.metadata.text_chunk);
          } else if (typeof chunk.document === 'string' && chunk.document.trim() !== '') {
            contextContent.push(chunk.document);
          }
        });
      }

      if (contextContent.length === 0) {
        console.warn(
          `Chunks were found for query "${userQuery}" (RAG Type from config: ${rag_type}, model: ${model}, stream), but no relevant content could be extracted. Querying LLM directly.`
        );
        augmentedPrompt = userQuery;
      } else {
        const context = contextContent.join('\n---\n');
        const contextDescription =
          rag_type === 'advanced' ? 'Relevant Information from Parent Documents' : 'Relevant Text Chunks';
        augmentedPrompt = `User Query: ${userQuery}\n\n${contextDescription}:\n---\n${context}\n---\nBased on the relevant information above, answer the user query.`;
      }
    }

    // console.log(`INFO: Gemini Stream Request. Model: ${model}. RAG Type: ${rag_type}.`); // Already logged above

    try {
      await generateText({
        model: model,
        onChunk: (chunk: LLMStreamChunk) => {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        },
        query: augmentedPrompt,
        stream: true,
      });
      res.end();
    } catch (llmError: any) {
      console.error(`Error calling llmWrapper for Gemini stream (model: ${model}):`, llmError);
      if (!res.writableEnded) {
        // Check if stream is still open
        res.write(
          `data: ${JSON.stringify({ details: llmError.message, error: `Failed to get response from LLM provider Gemini.` })}\n\n`
        );
        res.end();
      }
    }
  } catch (error: any) {
    console.error(`Error in handleGeminiStream for model ${model}, query "${userQuery}":`, error); // Use userQuery for logging
    if (!res.headersSent) {
      // This case should ideally not be reached if query validation is first.
      // However, for other early errors (like RAG service init), this is a fallback.
      if (error.message && error.message.includes('ChromaDB collection is not initialized')) {
        res.status(503).json({ error: 'Service Unavailable: RAG service is not ready.' });
        return;
      }
      if (error.message && error.message.includes('Failed to initialize embedding pipeline')) {
        res.status(503).json({ error: 'Service Unavailable: Embedding model not ready.' });
        return;
      }
      res.status(500).json({ details: error.message, error: 'Internal Server Error' });
    } else if (!res.writableEnded) {
      // Headers sent, stream is open, write error to stream
      let errorMessage = 'Internal Server Error';
      if (error.message && error.message.includes('ChromaDB collection is not initialized')) {
        errorMessage = 'Service Unavailable: RAG service is not ready.';
      } else if (error.message && error.message.includes('Failed to initialize embedding pipeline')) {
        errorMessage = 'Service Unavailable: Embedding model not ready.';
      }
      res.write(`data: ${JSON.stringify({ details: error.message, error: errorMessage })}\n\n`);
      res.end();
    }
    // If res.writableEnded is true, can't do anything more.
  }
};
