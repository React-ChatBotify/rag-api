import { NextFunction, Request, Response } from 'express';

import { config } from '../config';
import Logger from '../logger';

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

  const queryKeyConfigured = config.ragQueryApiKey && config.ragQueryApiKey.trim() !== '';
  const managementKeyConfigured = config.ragManagementApiKey && config.ragManagementApiKey.trim() !== '';

  if (!queryKeyConfigured && !managementKeyConfigured) {
    Logger.error('Neither RAG Query API Key nor RAG Management API Key are configured. Denying access.');
    return res.status(500).json({ error: 'Internal Server Error. No API key for RAG query service is configured.' });
  }

  if (!apiKey) {
    return res.status(401).json({ error: 'Unauthorized. API key is missing.' });
  }

  const isValidQueryKey = queryKeyConfigured && apiKey === config.ragQueryApiKey;
  const isValidManagementKey = managementKeyConfigured && apiKey === config.ragManagementApiKey;

  if (!isValidQueryKey && !isValidManagementKey) {
    return res.status(401).json({ error: 'Unauthorized. API key is invalid.' });
  }

  next();
};
