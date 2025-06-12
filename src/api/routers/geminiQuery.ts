import { Router } from 'express';

import { handleGeminiBatch, handleGeminiStream } from '../controllers/geminiQuery';
import { queryApiKeyAuth } from '../middleware/auth';

const geminiRouter = Router();

// gemini proxy endpoints
geminiRouter.post('/gemini/models/:model', queryApiKeyAuth, (req, res) => {
  const model = req.params.model;

  if (model.endsWith(':generateContent')) {
    req.params.model = model.replace(':generateContent', '');
    return handleGeminiBatch(req, res);
  }

  if (model.endsWith(':streamGenerateContent')) {
    req.params.model = model.replace(':streamGenerateContent', '');
    return handleGeminiStream(req, res);
  }

  return res.status(404).json({ error: 'Unsupported Gemini operation' });
});

export { geminiRouter };
