/**
 * Smart Retry Logic — Automatic retry with fallback strategies
 * Retries failed visits with: different proxies, different user agents, adjusted timing
 */

export class SmartRetry {
  constructor(options = {}) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffMultiplier: 2,
      maxTotalDelay: 10000,
      retryOnStatus: [403, 429, 500, 502, 503, 504],
      ...options,
    };

    this.retryHistory = []; // Track retry attempts
    this.stats = {
      totalRetries: 0,
      successfulRetries: 0,
      failedRetries: 0,
    };
  }

  // -----------------------------------------------------------------------
  // Should we retry this result?
  // -----------------------------------------------------------------------
  shouldRetry(result, attempt) {
    if (attempt >= this.config.maxRetries) return false;

    // Don't retry successful results
    if (result.success && result.statusCode < 400) return false;

    // Retry on specific HTTP status codes
    if (result.statusCode && this.config.retryOnStatus.includes(result.statusCode)) {
      return true;
    }

    // Retry on network errors
    if (!result.success && !result.statusCode) {
      return true;
    }

    // Retry on timeouts
    if (result.error && result.error.includes('timeout')) {
      return true;
    }

    return false;
  }

  // -----------------------------------------------------------------------
  // Calculate retry delay with exponential backoff
  // -----------------------------------------------------------------------
  getRetryDelay(attempt) {
    const delay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt);
    return Math.min(delay, this.config.maxTotalDelay);
  }

  // -----------------------------------------------------------------------
  // Execute with retry logic
  // -----------------------------------------------------------------------
  async executeWithRetry(executor, options = {}) {
    const maxRetries = options.maxRetries || this.config.maxRetries;
    const onRetry = options.onRetry || null;
    const onSuccess = options.onSuccess || null;

    let lastResult = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const result = await executor(attempt);
        lastResult = result;

        if (result.success && result.statusCode < 400) {
          if (onSuccess) onSuccess(result, attempt);
          return { success: true, result, attempts: attempt + 1, retries: attempt };
        }

        if (!this.shouldRetry(result, attempt)) {
          return { success: false, result, attempts: attempt + 1, retries: attempt };
        }

        // Retry
        const delay = this.getRetryDelay(attempt);
        this.stats.totalRetries++;
        this.retryHistory.push({
          timestamp: Date.now(),
          attempt,
          success: false,
          error: result.error,
          statusCode: result.statusCode,
        });

        if (onRetry) onRetry(result, attempt, delay);

        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      } catch (err) {
        lastResult = { success: false, error: err.message };
        if (!this.shouldRetry(lastResult, attempt)) {
          return { success: false, result: lastResult, attempts: attempt + 1, retries: attempt };
        }

        const delay = this.getRetryDelay(attempt);
        this.stats.totalRetries++;
        this.retryHistory.push({
          timestamp: Date.now(),
          attempt,
          success: false,
          error: err.message,
        });

        if (onRetry) onRetry(lastResult, attempt, delay);

        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }

    this.stats.failedRetries++;
    return { success: false, result: lastResult, attempts: maxRetries + 1, retries: maxRetries };
  }

  // -----------------------------------------------------------------------
  // Get retry stats
  // -----------------------------------------------------------------------
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRetries > 0
        ? Math.round((this.stats.successfulRetries / this.stats.totalRetries) * 100)
        : 0,
    };
  }

  // -----------------------------------------------------------------------
  // Get retry history
  // -----------------------------------------------------------------------
  getHistory(limit = 50) {
    return this.retryHistory.slice(-limit);
  }

  // -----------------------------------------------------------------------
  // Reset stats
  // -----------------------------------------------------------------------
  reset() {
    this.retryHistory = [];
    this.stats = { totalRetries: 0, successfulRetries: 0, failedRetries: 0 };
  }
}

