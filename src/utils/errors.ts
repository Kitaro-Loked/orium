/**
 * Orium - Structured Error Handling
 * Hierarchical error classes for precise error handling.
 */

export class OriumError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'OriumError';
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export class AdapterError extends OriumError {
  constructor(
    public adapter: string,
    code: 'NETWORK_ERROR' | 'RATE_LIMIT' | 'INVALID_RESPONSE' | 'AUTH_ERROR' | 'TIMEOUT' | 'UNKNOWN',
    message: string,
    statusCode?: number,
    originalError?: unknown
  ) {
    super(`[${adapter}] ${message}`, `ADAPTER_${code}`, statusCode, originalError);
    this.name = 'AdapterError';
  }
}

export class ValidationError extends OriumError {
  constructor(
    message: string,
    public fields?: Record<string, string[]>
  ) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class ConfigError extends OriumError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 500);
    this.name = 'ConfigError';
  }
}

export class TimeoutError extends OriumError {
  constructor(public operation: string, public timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', 504);
    this.name = 'TimeoutError';
  }
}

export class NotFoundError extends OriumError {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` '${id}'` : ''} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}
