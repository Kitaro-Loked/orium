/**
 * Orium - Structured Logger
 * Simple, performant logging with multiple levels.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: unknown;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;
  private context: string;

  constructor(context = 'orium', level: LogLevel = 'info') {
    this.context = context;
    this.level = this.resolveLevel(level);
  }

  private resolveLevel(level: LogLevel): LogLevel {
    const envLevel = (process.env.ORIUM_LOG_LEVEL || process.env.LOG_LEVEL) as LogLevel | undefined;
    if (envLevel && envLevel in LEVEL_PRIORITY) return envLevel;
    return level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private format(entry: LogEntry): string {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${this.context}]`;
    if (entry.data !== undefined) {
      return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`;
    }
    return `${prefix} ${entry.message}`;
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      data,
    };

    const formatted = this.format(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`, this.level);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

export const logger = new Logger('orium');
export { Logger };
