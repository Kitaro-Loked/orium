/**
 * Orium - Safe HTTP Client
 * Wrapper around fetch with timeout, retry, and error handling.
 */

import { AdapterError } from './errors';
import { logger } from './logger';

export interface FetchOptions extends RequestInit {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  adapterName?: string;
}

export interface FetchResult<T> {
  data: T;
  status: number;
  headers: Headers;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe fetch with timeout, retries, and structured error handling.
 */
export async function safeFetch<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult<T>> {
  const {
    timeout = 30000,
    maxRetries = 3,
    retryDelay = 1000,
    adapterName = 'unknown',
    ...fetchOptions
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Redact sensitive headers for logging
      const logHeaders = { ...fetchOptions.headers } as Record<string, string>;
      if (logHeaders['Authorization']) {
        logHeaders['Authorization'] = 'Bearer ***REDACTED***';
      }
      logger.debug(`HTTP ${fetchOptions.method || 'GET'} ${url}`, { headers: logHeaders, attempt: attempt + 1 });

      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 5xx and 429
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries - 1) {
        const backoff = retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
        logger.warn(`HTTP ${res.status} on ${url}, retrying in ${Math.round(backoff)}ms`);
        await delay(backoff);
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 403) {
          throw new AdapterError(adapterName, 'AUTH_ERROR', `Authentication failed: ${res.status} ${text}`, res.status);
        }
        if (res.status === 429) {
          throw new AdapterError(adapterName, 'RATE_LIMIT', `Rate limited: ${res.status} ${text}`, 429);
        }
        throw new AdapterError(adapterName, 'INVALID_RESPONSE', `HTTP ${res.status}: ${text}`, res.status);
      }

      const data = (await res.json()) as T;
      logger.debug(`HTTP success ${url}`, { status: res.status });
      return { data, status: res.status, headers: res.headers };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof AdapterError) throw err;

      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          lastError = new AdapterError(adapterName, 'TIMEOUT', `Request timed out after ${timeout}ms`, undefined, err);
        } else if (err.message.includes('fetch') || err.message.includes('network')) {
          lastError = new AdapterError(adapterName, 'NETWORK_ERROR', err.message, undefined, err);
        } else {
          lastError = err;
        }
      } else {
        lastError = new Error(String(err));
      }

      if (attempt < maxRetries - 1) {
        const backoff = retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
        logger.warn(`Network error on ${url}, retrying in ${Math.round(backoff)}ms`, { error: lastError.message });
        await delay(backoff);
      }
    }
  }

  throw lastError || new AdapterError(adapterName, 'UNKNOWN', 'Max retries exceeded');
}

/**
 * Simple health check with timeout.
 */
export async function healthCheck(url: string, apiKey?: string, timeout = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}
