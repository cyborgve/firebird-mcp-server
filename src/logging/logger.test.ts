import { describe, expect, test, afterEach, vi } from 'vitest';
import { logger, log, setMinLogLevel, getMinLogLevel, resetMinLogLevel } from './logger';

function parseLogEntry(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

describe('logger', () => {
  afterEach(() => {
    resetMinLogLevel();
    vi.restoreAllMocks();
  });

  test('default min level should be info', () => {
    expect(getMinLogLevel()).toBe('info');
  });

  test('setMinLogLevel should change the current level', () => {
    setMinLogLevel('debug');
    expect(getMinLogLevel()).toBe('debug');

    setMinLogLevel('error');
    expect(getMinLogLevel()).toBe('error');
  });

  test('resetMinLogLevel should restore default', () => {
    setMinLogLevel('error');
    resetMinLogLevel();
    expect(getMinLogLevel()).toBe('info');
  });

  test('should suppress messages below the current level', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    setMinLogLevel('error');
    log('debug', 'debug message');
    log('info', 'info message');
    log('warning', 'warning message');

    expect(writeSpy).not.toHaveBeenCalled();
  });

  test('should write messages at or above the current level', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    setMinLogLevel('warning');
    log('warning', 'warning message');
    log('error', 'error message');

    expect(writeSpy).toHaveBeenCalledTimes(2);
  });

  test('should write valid JSON to stderr', () => {
    let captured = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      captured += String(data);
      return true;
    });

    log('info', 'test message', { correlationId: 'req-1' });

    const parsed = parseLogEntry(captured.trim());
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('test message');
    expect(parsed.correlationId).toBe('req-1');
    expect(typeof parsed.timestamp).toBe('string');
  });

  test('logger convenience methods should delegate correctly', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    setMinLogLevel('debug');
    logger.debug('d');
    logger.info('i');
    logger.warning('w');
    logger.error('e');

    expect(writeSpy).toHaveBeenCalledTimes(4);
  });

  test('should include context fields in log entry', () => {
    let captured = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      captured += String(data);
      return true;
    });

    log('info', 'with context', { tool: 'ping', latencyMs: 42 });

    const parsed = parseLogEntry(captured.trim());
    expect(parsed.tool).toBe('ping');
    expect(parsed.latencyMs).toBe(42);
  });

  test('should redact sensitive context fields', () => {
    let captured = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      captured += String(data);
      return true;
    });

    log('info', 'sensitive context', {
      password: 'super-secret',
      authToken: 'abc123',
      host: 'db.example.com',
      port: 3050,
      database: '/db/myapp.fdb',
      firebird: { user: 'SYSDBA' },
      nested: {
        authorization: 'Bearer token',
      },
      normalField: 'ok',
    });

    const parsed = JSON.parse(captured.trim()) as Record<string, unknown>;
    expect(parsed.password).toBe('***');
    expect(parsed.authToken).toBe('***');
    expect(parsed.host).toBe('db.example.com');
    expect(parsed.port).toBe(3050);
    expect(parsed.database).toBe('/db/myapp.fdb');
    expect(parsed.firebird).toEqual({ user: 'SYSDBA' });
    expect((parsed.nested as Record<string, unknown>).authorization).toBe('***');
    expect(parsed.normalField).toBe('ok');
  });
});
