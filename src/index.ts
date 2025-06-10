import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

import { config } from './config';
import Logger from './logger';
import { geminiRouter } from './routers/geminiQuery';
import { ragManagementRouter } from './routers/ragManagement';
import swaggerDocument from './swagger';
import { logs as apiLogs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// OpenTelemetry SDK Initialization

// Shared Resource
const resource = new Resource({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'otel-collector',
});

// Trace Exporter
const otelTraceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'otel-collector:4317',
});

// Log Exporter
const otelLogExporter = new OTLPLogExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'otel-collectort:4317',
});

// Logger Provider
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(otelLogExporter));

// Set global logger provider (important for Winston transport and other integrations)
apiLogs.setGlobalLoggerProvider(loggerProvider);

const sdk = new NodeSDK({
  // loggerProvider: loggerProvider, // loggerProvider is not a direct NodeSDK option in this version
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],

  resource: resource,

  // Use the shared resource
  spanProcessor: new BatchSpanProcessor(otelTraceExporter),
});

try {
  sdk.start();
  Logger.info('OpenTelemetry SDK (traces and logs) started successfully.');
} catch (error) {
  Logger.error('Error starting OpenTelemetry SDK:', { error });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => Logger.info('OpenTelemetry SDK shut down successfully.'))
    .catch((error) => Logger.error('Error shutting down OpenTelemetry SDK:', { error }))
    .finally(() => process.exit(0));
});

const app = express();

const API_PREFIX = `/api/${process.env.API_VERSION || 'v1'}`;
app.use(bodyParser.json());
const allowedOrigins = process.env.FRONTEND_WEBSITE_URLS?.split(',').map((origin) => origin.trim()) || [];
// handle cors with a dynamic origin function
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins?.indexOf(origin) !== -1) {
        // if the origin is found in the allowedOrigins array, allow it
        return callback(null, true);
      } else {
        // if the origin is not found in the allowedOrigins array, block it
        Logger.info(`Allowed origins: ${allowedOrigins}`);
        return callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
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

  Logger.info(`Swagger docs loaded.`);
};

loadSwaggerFiles();

app.listen(config.port, () => {
  Logger.info(`LLM proxy service listening on port: ${config.port}`);
});
