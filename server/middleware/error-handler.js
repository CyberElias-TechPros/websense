// ============================================================================
// error-handler.js — Centralized error handling.
// 404 for unknown routes, 500 for unhandled errors (logged).
// ============================================================================

import logger from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: err.message || undefined,
  });
}
