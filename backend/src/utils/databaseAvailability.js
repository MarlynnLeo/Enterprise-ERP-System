/**
 * Helpers for short-lived database transport failures.
 *
 * Read-only authentication lookups are safe to retry once.  Retrying writes
 * here would be unsafe because their outcome may be unknown after a network
 * interruption.
 */

const TRANSIENT_DATABASE_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
]);

const isTransientDatabaseError = (error) => {
  let current = error;

  // mysql2 occasionally wraps the network error in `cause`.
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (TRANSIENT_DATABASE_ERROR_CODES.has(current.code)) {
      return true;
    }
    current = current.cause;
  }

  return false;
};

const wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

/**
 * Retry a read-only database operation once for a recoverable transport error.
 */
const retryTransientDatabaseRead = async (
  operation,
  { attempts = 2, delayMs = 150, onRetry } = {}
) => {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts) {
        throw error;
      }

      onRetry?.(error, attempt, delayMs);
      await wait(delayMs);
    }
  }

  throw lastError;
};

module.exports = {
  TRANSIENT_DATABASE_ERROR_CODES,
  isTransientDatabaseError,
  retryTransientDatabaseRead,
};
