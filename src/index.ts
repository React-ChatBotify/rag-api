import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

import { config } from './config';
import { geminiRouter } from './routers/geminiQuery';
import { ragManagementRouter } from './routers/ragManagement';
import swaggerDocument from './swagger';

const app = express();

const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;
app.use(bodyParser.json());
const allowedOrigins = process.env.FRONTEND_WEBSITE_URLS?.split(',').map((origin) => origin.trim()) || [];
// handle cors with a dynamic origin function
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins?.indexOf(origin) !== -1) {
        // if the origin is found in the allowedOrigins array, allow it
        return callback(null, true);
      } else {
        // if the origin is not found in the allowedOrigins array, block it
        console.info(`Allowed origins: ${allowedOrigins}`);
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(`${API_PREFIX}/rag/manage`, ragManagementRouter);
app.use(`${API_PREFIX}/`, geminiRouter);

// grab all swagger path files
const swaggerDir = path.join(__dirname, './swagger');
const swaggerFiles = fs
  .readdirSync(swaggerDir)
  .filter((file) => (path.extname(file) === '.ts' || path.extname(file) === '.js') && !file.endsWith('.d.ts'));

let result = {};

const loadSwaggerFiles = async () => {
  for (const file of swaggerFiles) {
    const filePath = path.join(__dirname, './swagger', file);
    const fileData = await import(filePath);
    result = { ...result, ...fileData.default };
  }

  (swaggerDocument as any).paths = result;

  app.use(
    `${API_PREFIX}/docs`,
    (req: any, res: any, next: any) => {
      req.swaggerDoc = swaggerDocument;
      next();
    },
    swaggerUi.serveFiles(swaggerDocument, {
      swaggerOptions: { defaultModelsExpandDepth: -1 },
    }),
    swaggerUi.setup()
  );

  console.info(`Swagger docs loaded.`);
};

loadSwaggerFiles();

app.listen(config.port, () => {
  console.info(`LLM proxy service listening on port: ${config.port}`);
});
