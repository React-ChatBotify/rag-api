import { Router } from 'express';

import {
  createDocument,
  deleteDocument,
  getDocument,
  getAllDocuments, // <-- Import added here
  updateDocument,
} from '../controllers/ragManagement';
import { apiKeyAuth } from '../middleware/auth';

const ragManagementRouter = Router();

// Apply apiKeyAuth middleware to all routes in this router
ragManagementRouter.use(apiKeyAuth);

// Define routes
ragManagementRouter.post('/documents', createDocument);
ragManagementRouter.get('/documents:all', getAllDocuments);
ragManagementRouter.get('/documents/:documentId', getDocument);
ragManagementRouter.put('/documents/:documentId', updateDocument);
ragManagementRouter.delete('/documents/:documentId', deleteDocument);

export { ragManagementRouter };
