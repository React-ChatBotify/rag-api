import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

import { config } from './config';
import { customRouter } from './routers/custom';
import { geminiRouter } from './routers/gemini';
import { openaiRouter } from './routers/openai';
import { ragManagementRouter } from './routers/ragManagement';
import { ragQueryRouter } from './routers/ragQuery'; // Added import
import swaggerDocument from './swagger';

const app = express();

const API_PREFIX = `/api/${process.env.API_VERSION}`;
app.use(bodyParser.json());
app.use(cors());
app.use(`${API_PREFIX}/`, openaiRouter);
app.use(`${API_PREFIX}/`, geminiRouter);
app.use(`${API_PREFIX}/`, customRouter);
app.use(`${API_PREFIX}/rag/manage`, ragManagementRouter);
app.use(`${API_PREFIX}/rag`, ragQueryRouter); // Added new router for public queries

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
