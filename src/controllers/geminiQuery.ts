import { Request, Response } from 'express';

import { config } from '../config';
import Logger from '../logger';
import { generateText } from '../services/llmWrapper';
import { initializedRagService } from '../services/ragService';
import { GeminiContent, GeminiQueryRequest, LLMChatResponse } from '../types';

export const handleGeminiBatch = async (req: Request, res: Response) => {
  const model = req.params.model;
  let userQueryForRAG = ''; // For RAG and general query representation

  try {
    const { contents } = req.body as GeminiQueryRequest;

    // Initial structural validation (can be enhanced to check all items)
    if (
      !contents ||
      !Array.isArray(contents) ||
      contents.length === 0 ||
      !contents.every(
        (item) =>
          item.parts &&
          Array.isArray(item.parts) &&
          item.parts.length > 0 &&
          item.parts.every((part) => part.text && typeof part.text === 'string')
      )
    ) {
      return res.status(400).json({
        error:
          'Bad Request: contents is required and must be an array of content items, each with at least one part containing a non-empty text string.',
      });
    }

    // Create userQueryForRAG from all parts of all content items
    if (contents && Array.isArray(contents)) {
      let messagesToConsider = contents;
      const windowSize = config.ragConversationWindowSize;

      if (windowSize && windowSize > 0 && windowSize < contents.length) {
        messagesToConsider = contents.slice(-windowSize); // Get the last N messages
        Logger.info(`RAG windowing: Using last ${windowSize} of ${contents.length} messages for RAG query.`);
      } else if (windowSize && windowSize > 0 && windowSize >= contents.length) {
        Logger.info(
          `RAG windowing: Window size ${windowSize} is >= total messages ${contents.length}. Using all messages for RAG query.`
        );
        // messagesToConsider remains 'contents'
      } else {
        // windowSize is 0 or not set
        Logger.info(`RAG windowing: Window size is 0 or not set. Using all ${contents.length} messages for RAG query.`);
        // messagesToConsider remains 'contents'
      }

      userQueryForRAG = messagesToConsider
        .flatMap((contentItem) => contentItem.parts.map((part) => part.text))
        .join('\n');
    }
    // userQueryForErrorLogging removed

    // Validate that the consolidated query is not empty
    if (userQueryForRAG.trim() === '') {
      return res.status(400).json({ error: 'Bad Request: Consolidated text from contents is empty.' });
    }

    const rag_type = config.geminiRagType;
    const numberOfResults = config.geminiNResults;

    Logger.info(
      `INFO: Gemini Batch Request. Model: ${model}. RAG Type (from config): ${rag_type}. N Results (from config): ${numberOfResults}. Consolidated user query for RAG (first 100 chars): "${userQueryForRAG.substring(0, 100)}..."`
    );

    const ragService = await initializedRagService;
    const chunks = await ragService.queryChunks(userQueryForRAG, numberOfResults);

    let contentsForLlm = JSON.parse(JSON.stringify(contents)) as GeminiContent[]; // Deep copy

    if (!chunks || chunks.length === 0) {
      Logger.warn(
        `No relevant chunks found for query (first 100 chars): "${userQueryForRAG.substring(0, 100)}..." with model ${model}. Querying LLM directly without RAG context.`
      );
      // contentsForLlm remains as is (original user contents)
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
        Logger.warn(
          `Chunks were found for query (first 100 chars): "${userQueryForRAG.substring(0, 100)}..." (RAG Type from config: ${rag_type}, model: ${model}), but no relevant content could be extracted. Querying LLM directly.`
        );
        // contentsForLlm remains as is
      } else {
        const context = contextContent.join('\n---\n');
        const contextDescription =
          rag_type === 'advanced' ? 'Relevant Information from Parent Documents' : 'Relevant Text Chunks';
        const ragAugmentationPrefix = `Based on the relevant information below, answer the user query.\n${contextDescription}:\n---\n${context}\n---\nConsidering the above context and the conversation history, here is the latest user message: `;

        const lastContentItem = contentsForLlm[contentsForLlm.length - 1];
        if (lastContentItem && lastContentItem.parts && lastContentItem.parts.length > 0) {
          lastContentItem.parts[0].text = ragAugmentationPrefix + lastContentItem.parts[0].text;
        } else {
          Logger.warn(
            'Last content item for RAG augmentation is malformed or missing parts. RAG context might not be prepended as expected.'
          );
          // Fallback: if the last message is weird, but we have context, maybe put context in its own message?
          // For now, the original plan is to modify the last message. If it's malformed, it won't be modified.
        }
      }
    }

    try {
      const llmResponse = (await generateText({
        model: model,
        contents: contentsForLlm, // Pass the (potentially RAG-augmented) GeminiContent[]
        stream: false,
      })) as LLMChatResponse;
      res.status(200).json(llmResponse);
    } catch (llmError: any) {
      Logger.error(`Error calling llmWrapper for Gemini batch (model: ${model}):`, llmError);
      return res
        .status(500)
        .json({ details: llmError.message, error: `Failed to get response from LLM provider Gemini.` });
    }
  } catch (error: any) {
    Logger.error(
      `Error in handleGeminiBatch for model ${model}, consolidated query (first 100 chars): "${userQueryForRAG.substring(0, 100)}":`,
      error
    );
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
  let userQueryForRAG = ''; // For RAG and general query representation

  try {
    const { contents } = req.body as GeminiQueryRequest;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initial structural validation (can be enhanced to check all items)
    if (
      !contents ||
      !Array.isArray(contents) ||
      contents.length === 0 ||
      !contents.every(
        (item) =>
          item.parts &&
          Array.isArray(item.parts) &&
          item.parts.length > 0 &&
          item.parts.every((part) => part.text && typeof part.text === 'string')
      )
    ) {
      if (!res.headersSent) {
        return res.status(400).json({
          error:
            'Bad Request: contents is required and must be an array of content items, each with at least one part containing a non-empty text string.',
        });
      } else {
        res.write(
          `data: ${JSON.stringify({
            error:
              'Bad Request: contents is required and must be an array of content items, each with at least one part containing a non-empty text string.',
          })}\n\n`
        );
        res.end();
        return;
      }
    }

    // Create userQueryForRAG from all parts of all content items
    if (contents && Array.isArray(contents)) {
      let messagesToConsider = contents;
      const windowSize = config.ragConversationWindowSize;

      if (windowSize && windowSize > 0 && windowSize < contents.length) {
        messagesToConsider = contents.slice(-windowSize); // Get the last N messages
        Logger.info(`RAG windowing: Using last ${windowSize} of ${contents.length} messages for RAG query (stream).`);
      } else if (windowSize && windowSize > 0 && windowSize >= contents.length) {
        Logger.info(
          `RAG windowing: Window size ${windowSize} is >= total messages ${contents.length}. Using all messages for RAG query (stream).`
        );
        // messagesToConsider remains 'contents'
      } else {
        // windowSize is 0 or not set
        Logger.info(
          `RAG windowing: Window size is 0 or not set. Using all ${contents.length} messages for RAG query (stream).`
        );
        // messagesToConsider remains 'contents'
      }

      userQueryForRAG = messagesToConsider
        .flatMap((contentItem) => contentItem.parts.map((part) => part.text))
        .join('\n');
    }
    // userQueryForErrorLogging removed

    // Validate that the consolidated query is not empty
    if (userQueryForRAG.trim() === '') {
      if (!res.headersSent) {
        return res.status(400).json({ error: 'Bad Request: Consolidated text from contents is empty.' });
      } else {
        res.write(`data: ${JSON.stringify({ error: 'Bad Request: Consolidated text from contents is empty.' })}\n\n`);
        res.end();
        return;
      }
    }
    res.flushHeaders(); // Send headers now that validation passed

    const rag_type = config.geminiRagType;
    const numberOfResults = config.geminiNResults;

    Logger.info(
      `INFO: Gemini Stream Request. Model: ${model}. RAG Type (from config): ${rag_type}. N Results (from config): ${numberOfResults}. Consolidated user query for RAG (first 100 chars): "${userQueryForRAG.substring(0, 100)}..."`
    );

    const ragService = await initializedRagService;
    const chunks = await ragService.queryChunks(userQueryForRAG, numberOfResults);

    let contentsForLlm = JSON.parse(JSON.stringify(contents)) as GeminiContent[]; // Deep copy

    if (!chunks || chunks.length === 0) {
      Logger.warn(
        `No relevant chunks found for query (first 100 chars): "${userQueryForRAG.substring(0, 100)}..." with model ${model} (stream). Querying LLM directly without RAG context.`
      );
      // contentsForLlm remains as is
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
        Logger.warn(
          `Chunks were found for query (first 100 chars): "${userQueryForRAG.substring(0, 100)}..." (RAG Type from config: ${rag_type}, model: ${model}, stream), but no relevant content could be extracted. Querying LLM directly.`
        );
        // contentsForLlm remains as is
      } else {
        const context = contextContent.join('\n---\n');
        const contextDescription =
          rag_type === 'advanced' ? 'Relevant Information from Parent Documents' : 'Relevant Text Chunks';
        const ragAugmentationPrefix = `Based on the relevant information below, answer the user query.\n${contextDescription}:\n---\n${context}\n---\nConsidering the above context and the conversation history, here is the latest user message: `;

        const lastContentItem = contentsForLlm[contentsForLlm.length - 1];
        if (lastContentItem && lastContentItem.parts && lastContentItem.parts.length > 0) {
          lastContentItem.parts[0].text = ragAugmentationPrefix + lastContentItem.parts[0].text;
        } else {
          Logger.warn(
            'Last content item for RAG augmentation is malformed or missing parts (stream). RAG context might not be prepended as expected.'
          );
        }
      }
    }

    try {
      await generateText({
        model: model,
        onChunk: (rawSseLine: string) => {
          res.write(`${rawSseLine}\n`);
        },
        contents: contentsForLlm, // Pass the (potentially RAG-augmented) GeminiContent[]
        stream: true,
      });
      res.end();
    } catch (llmError: any) {
      Logger.error(`Error calling llmWrapper for Gemini stream (model: ${model}):`, llmError);
      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({ details: llmError.message, error: `Failed to get response from LLM provider Gemini.` })}\n\n`
        );
        res.end();
      }
    }
  } catch (error: any) {
    Logger.error(
      `Error in handleGeminiStream for model ${model}, consolidated query (first 100 chars): "${userQueryForRAG.substring(0, 100)}":`,
      error
    );
    if (!res.headersSent) {
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
      let errorMessage = 'Internal Server Error';
      if (error.message && error.message.includes('ChromaDB collection is not initialized')) {
        errorMessage = 'Service Unavailable: RAG service is not ready.';
      } else if (error.message && error.message.includes('Failed to initialize embedding pipeline')) {
        errorMessage = 'Service Unavailable: Embedding model not ready.';
      }
      res.write(`data: ${JSON.stringify({ details: error.message, error: errorMessage })}\n\n`);
      res.end();
    }
  }
};
