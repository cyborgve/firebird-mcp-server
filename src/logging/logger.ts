import { stderr } from 'node:process';

/**
 * Defines the standard severity classifications for system logs, conforming to RFC 5424 specifications
 * as strongly recommended by the Model Context Protocol standards.
 */
export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
};

/**
 * Represents the structured payload of a single log event, enforcing JSON formatting for external observability tools.
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEY_PATTERN = /(password|secret|token|authorization|api[_-]?key|credential)/i;

let currentMinLevel: LogLevel = 'info';

export function setMinLogLevel(level: LogLevel): void {
  currentMinLevel = level;
}

export function getMinLogLevel(): LogLevel {
  return currentMinLevel;
}

export function resetMinLogLevel(): void {
  currentMinLevel = 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentMinLevel];
}

function redactByKey(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return '***';
    }
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(() => '***');
      }
      const redacted: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        redacted[k] = SENSITIVE_KEY_PATTERN.test(k) ? '***' : redactByKey(k, v);
      }
      return redacted;
    }
    return '***';
  }

  return sanitizeValue(value);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(record)) {
      sanitized[key] = redactByKey(key, nestedValue);
    }

    return sanitized;
  }

  return value;
}

function sanitizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    sanitized[key] = redactByKey(key, value);
  }

  return sanitized;
}

/**
 * Formats and emits a structured JSON log entry strictly to the standard error stream (`stderr`).
 *
 * Adhering to the MCP `stdio` transport specification, standard output (`stdout`) is singularly reserved
 * for JSON-RPC communication; all diagnostics, telemetry, and unhandled faults must be partitioned to `stderr`.
 *
 * @param level - The severity classification of the event.
 * @param message - A concise, human-readable description of the log event.
 * @param context - Extensible structured data providing operational context (must be sanitized of sensitive credentials).
 */
export function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...sanitizeContext(context),
  };

  stderr.write(`${JSON.stringify(entry)}\n`);
}

/**
 * A singleton utility object providing ergonomic, pre-bound logging methods for standardized severities.
 */
export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    log('debug', message, context);
  },
  info(message: string, context?: Record<string, unknown>): void {
    log('info', message, context);
  },
  warning(message: string, context?: Record<string, unknown>): void {
    log('warning', message, context);
  },
  error(message: string, context?: Record<string, unknown>): void {
    log('error', message, context);
  },
};
