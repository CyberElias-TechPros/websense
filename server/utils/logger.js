// ============================================================================
// logger.js — Structured logging (Winston).
// Console (colorized) + rotating file transports. Emits structured JSON for
// machine-readable log shipping.
// ============================================================================

import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const { combine, timestamp, errors, splat, printf, colorize, json } = winston.format;

const consoleFormat = printf(({ timestamp, level, message, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), errors({ stack: true }), splat()),
  defaultMeta: { service: 'proxy-visitor' },
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), consoleFormat),
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
      format: combine(timestamp(), json()),
    }),
  ],
});

export default logger;
