import { Request, Response } from 'express';
import { initializedRagService } from '../services/ragService';

export const createDocument = async (req: Request, res: Response) => {
    try {
        const { documentId, markdownContent } = req.body;

        if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') {
            return res.status(400).json({ error: "Bad Request: documentId is required and must be a non-empty string." });
        }
        if (!markdownContent || typeof markdownContent !== 'string') {
            return res.status(400).json({ error: "Bad Request: markdownContent is required and must be a string." });
        }

        const ragService = await initializedRagService;
        await ragService.addDocument(documentId, markdownContent);
        return res.status(201).json({ message: "Document added successfully", documentId });
    } catch (error: any) {
        console.error(`Error in createDocument for ID ${req.body.documentId}:`, error);
        // Check for specific error types if ragService throws custom errors
        if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
            return res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
        }
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

export const getDocument = async (req: Request, res: Response) => {
    try {
        const { documentId } = req.params;
        if (!documentId || documentId.trim() === '') {
            return res.status(400).json({ error: "Bad Request: documentId parameter is required." });
        }

        const ragService = await initializedRagService;
        const content = await ragService.getParentDocumentContent(documentId);

        if (content !== null) {
            return res.status(200).json({ documentId, content });
        } else {
            return res.status(404).json({ error: "Not Found: Document not found." });
        }
    } catch (error: any) {
        console.error(`Error in getDocument for ID ${req.params.documentId}:`, error);
        if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
            return res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
        }
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

export const updateDocument = async (req: Request, res: Response) => {
    try {
        const { documentId } = req.params;
        const { markdownContent } = req.body;

        if (!documentId || documentId.trim() === '') {
            return res.status(400).json({ error: "Bad Request: documentId parameter is required." });
        }
        if (!markdownContent || typeof markdownContent !== 'string') {
            return res.status(400).json({ error: "Bad Request: markdownContent is required in the body and must be a string." });
        }

        const ragService = await initializedRagService;
        // First check if document exists to decide on 404 vs update.
        // RAGService's updateDocument internally calls delete then add.
        // If deleteDocument doesn't find chunks, it's a no-op.
        // If addDocument then creates it, it's more like an upsert.
        // For strict update, we might need a check.
        // However, the current ragService.updateDocument implies an upsert-like behavior if delete finds nothing.
        // Let's assume for now that an "update" on a non-existent document should effectively create it,
        // or the underlying service handles this by not erroring if it tries to delete non-existent chunks first.
        // If a strict "update only if exists" is needed, a ragService.documentExists() or similar check would be required first.
        await ragService.updateDocument(documentId, markdownContent);
        return res.status(200).json({ message: "Document updated successfully", documentId });
    } catch (error: any) {
        console.error(`Error in updateDocument for ID ${req.params.documentId}:`, error);
        if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
            return res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
        }
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};

export const deleteDocument = async (req: Request, res: Response) => {
    try {
        const { documentId } = req.params;
        if (!documentId || documentId.trim() === '') {
            return res.status(400).json({ error: "Bad Request: documentId parameter is required." });
        }

        const ragService = await initializedRagService;
        await ragService.deleteDocument(documentId);
        // deleteDocument in RAGService doesn't throw if document not found, just logs.
        // So, a 200 is fine here, or 204. 200 with message is more informative.
        return res.status(200).json({ message: "Document deleted successfully (or did not exist)", documentId });
    } catch (error: any) {
        console.error(`Error in deleteDocument for ID ${req.params.documentId}:`, error);
        if (error.message && error.message.includes("ChromaDB collection is not initialized")) {
            return res.status(503).json({ error: "Service Unavailable: RAG service is not ready." });
        }
        return res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};
