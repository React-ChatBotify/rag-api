import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.header('X-API-Key');

    if (!config.ragApiKey || config.ragApiKey.trim() === '') {
        console.error("RAG API Key not configured. Denying access.");
        return res.status(500).json({ error: "Internal Server Error. API key for RAG service not configured." });
    }

    if (!apiKey) {
        return res.status(401).json({ error: "Unauthorized. API key is missing." });
    }

    if (apiKey !== config.ragApiKey) {
        return res.status(401).json({ error: "Unauthorized. API key is invalid." });
    }

    next();
};
