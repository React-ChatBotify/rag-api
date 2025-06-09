import { Router } from 'express';
import { handleGeminiBatch, handleGeminiStream } from '../controllers/geminiQuery';
import { queryApiKeyAuth } from '../middleware/auth';

const geminiRouter = Router();

// Route for batch processing
geminiRouter.post('/gemini/models/:model:generateContent', queryApiKeyAuth, handleGeminiBatch);

// Route for streaming
geminiRouter.post('/gemini/models/:model:streamGenerateContent', queryApiKeyAuth, handleGeminiStream);

export { geminiRouter };
