import { Router } from 'express';
import { handleGeminiBatch, handleGeminiStream } from '../controllers/geminiQuery';

const geminiRouter = Router();

// Route for batch processing
geminiRouter.post('/gemini/models/:model:generateContent', handleGeminiBatch);

// Route for streaming
geminiRouter.post('/gemini/models/:model:streamGenerateContent', handleGeminiStream);

export { geminiRouter };
