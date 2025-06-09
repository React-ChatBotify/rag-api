import { NextFunction, Request, Response } from 'express';

import { config } from '../config';

export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-KEY');

  if (!config.ragManagementApiKey || config.ragManagementApiKey.trim() === '') {
    Logger.error('RAG API Key not configured. Denying access.');
    return res.status(500).json({ error: 'Internal Server Error. API key for RAG service not configured.' });
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized. API key is missing.' });
  }

  if (apiKey !== config.ragManagementApiKey) {
    return res.status(401).json({ error: 'Unauthorized. API key is invalid.' });
  }

  next();
};

export const queryApiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-KEY');

  if (!config.ragQueryApiKey || config.ragQueryApiKey.trim() === '') {
    Logger.error('RAG Query API Key not configured. Denying access.');
    return res.status(500).json({ error: 'Internal Server Error. API key for RAG query service not configured.' });
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized. API key is missing.' });
  }

  if (apiKey !== config.ragQueryApiKey) {
    return res.status(401).json({ error: 'Unauthorized. API key is invalid.' });
  }

  next();
};
