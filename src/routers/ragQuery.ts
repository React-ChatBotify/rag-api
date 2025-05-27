import { Router } from 'express';
import { handleRagQuery } from '../controllers/ragQuery';

const ragQueryRouter = Router();

// This endpoint is public and does not use apiKeyAuth
ragQueryRouter.post('/query', handleRagQuery);

export { ragQueryRouter };
