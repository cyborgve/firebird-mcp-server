import { describe, expect, test, afterEach } from 'vitest';
import { getRuntimeConfig } from './env-config';

/**
 * We test getRuntimeConfig by manipulating environment variables.
 * The module reads from process.env at call-time, so we can control
 * output by setting/deleting vars before each call.
 */

// Save the original env so we can restore it after each test
const originalEnv = { ...process.env };

describe('getRuntimeConfig', () => {
  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  test('should return sensible defaults when no env vars are set', () => {
    delete process.env.FIREBIRD_HOST;
    delete process.env.FIREBIRD_PORT;
    delete process.env.FIREBIRD_DATABASE;
    delete process.env.FIREBIRD_USER;
    delete process.env.FIREBIRD_PASSWORD;
    delete process.env.FIREBIRD_ROLE;
    delete process.env.FIREBIRD_CHARSET;
    delete process.env.MCP_TOOL_TIMEOUT_MS;
    delete process.env.MCP_LIST_TABLES_MAX_ITEMS;
    delete process.env.MCP_SCHEMA_MAX_TABLES;
    delete process.env.MCP_SCHEMA_MAX_COLUMNS_PER_TABLE;
    delete process.env.MCP_EXECUTE_QUERY_MAX_ROWS;
    delete process.env.MCP_EXECUTE_QUERY_MAX_PARAMS;
    delete process.env.MCP_EXECUTE_QUERY_MODE;
    delete process.env.MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS;
    delete process.env.MCP_TOOLS_CONFIG_PATH;
    delete process.env.MCP_TOOLSET;
    delete process.env.MCP_TOOLSETS;
    delete process.env.MCP_TOOLS;
    delete process.env.MCP_TOOLS_RELOAD_ENABLED;
    delete process.env.MCP_TELEMETRY_ENABLED;
    delete process.env.MCP_TELEMETRY_EXPORTER;
    delete process.env.MCP_TELEMETRY_MAX_STORED_SPANS;
    delete process.env.MCP_TELEMETRY_CLIENT_PROFILE;
    delete process.env.MCP_TRANSPORT;
    delete process.env.MCP_HTTP_HOST;
    delete process.env.MCP_HTTP_PORT;
    delete process.env.MCP_HTTP_PATH;
    delete process.env.MCP_HTTP_ALLOWED_ORIGINS;
    delete process.env.MCP_HTTP_REQUIRE_AUTH;
    delete process.env.MCP_HTTP_AUTH_TOKEN;
    delete process.env.MCP_HTTP_ENFORCE_PROTOCOL_VERSION;

    const config = getRuntimeConfig();

    expect(config.mcpTransport).toBe('stdio');
    expect(config.firebird.host).toBe('127.0.0.1');
    expect(config.firebird.port).toBe(3050);
    expect(config.firebird.database).toBe('');
    expect(config.firebird.user).toBe('SYSDBA');
    expect(config.firebird.password).toBe('');
    expect(config.firebird.charset).toBe('UTF8');
    expect(config.firebird.role).toBeUndefined();
    expect(config.executeQueryMode).toBe('safe');
    expect(config.executeQueryAllowedIdentifiers).toEqual([]);
    expect(config.toolsConfigPath).toBeUndefined();
    expect(config.toolsets).toEqual([]);
    expect(config.enabledTools).toEqual([]);
    expect(config.toolsReloadEnabled).toBe(false);
    expect(config.telemetry.enabled).toBe(false);
    expect(config.telemetry.exporter).toBe('logs');
    expect(config.telemetry.maxStoredSpans).toBe(200);
    expect(config.telemetry.clientProfile).toBeUndefined();
    expect(config.http.host).toBe('127.0.0.1');
    expect(config.http.port).toBe(3000);
    expect(config.http.path).toBe('/mcp');
    expect(config.http.maxRequestBodyBytes).toBe(1024 * 1024);
    expect(config.http.allowedOrigins).toEqual([]);
    expect(config.http.requireAuthentication).toBe(false);
    expect(config.http.authToken).toBeUndefined();
    expect(config.http.enforceProtocolVersionHeader).toBe(true);
  });

  test('should read firebird config from env', () => {
    process.env.FIREBIRD_HOST = '10.0.0.1';
    process.env.FIREBIRD_PORT = '3051';
    process.env.FIREBIRD_DATABASE = '/data/test.fdb';
    process.env.FIREBIRD_USER = 'TEST_USER';
    process.env.FIREBIRD_PASSWORD = 'test_pass';
    process.env.FIREBIRD_ROLE = 'ADMIN';
    process.env.FIREBIRD_CHARSET = 'NONE';

    const config = getRuntimeConfig();

    expect(config.firebird.host).toBe('10.0.0.1');
    expect(config.firebird.port).toBe(3051);
    expect(config.firebird.database).toBe('/data/test.fdb');
    expect(config.firebird.user).toBe('TEST_USER');
    expect(config.firebird.password).toBe('test_pass');
    expect(config.firebird.role).toBe('ADMIN');
    expect(config.firebird.charset).toBe('NONE');
  });

  test('should throw when FIREBIRD_DATABASE is configured without FIREBIRD_PASSWORD', () => {
    process.env.FIREBIRD_DATABASE = '/data/prod.fdb';
    delete process.env.FIREBIRD_PASSWORD;

    expect(() => getRuntimeConfig()).toThrow(
      'FIREBIRD_PASSWORD is required when FIREBIRD_DATABASE is configured',
    );
  });

  test('should parse and bound MCP_HTTP_MAX_BODY_BYTES', () => {
    process.env.MCP_HTTP_MAX_BODY_BYTES = '512';

    const config = getRuntimeConfig();

    expect(config.http.maxRequestBodyBytes).toBe(1024);
  });

  test('should omit role when it is empty or whitespace', () => {
    process.env.FIREBIRD_ROLE = '   ';

    const config = getRuntimeConfig();

    expect(config.firebird.role).toBeUndefined();
  });

  test('should clamp timeout below minimum to 1000', () => {
    process.env.MCP_TOOL_TIMEOUT_MS = '100';

    const config = getRuntimeConfig();

    expect(config.limits.timeoutMs).toBe(1000);
  });

  test('should clamp timeout above maximum to 120000', () => {
    process.env.MCP_TOOL_TIMEOUT_MS = '999999';

    const config = getRuntimeConfig();

    expect(config.limits.timeoutMs).toBe(120000);
  });

  test('should fall back to default on non-numeric timeout', () => {
    process.env.MCP_TOOL_TIMEOUT_MS = 'not-a-number';

    const config = getRuntimeConfig();

    expect(config.limits.timeoutMs).toBe(10000);
  });

  test('should parse valid bounded integer values', () => {
    process.env.MCP_EXECUTE_QUERY_MAX_ROWS = '50';

    const config = getRuntimeConfig();

    expect(config.limits.executeQueryMaxRows).toBe(50);
  });

  test('should fall back to default on empty string', () => {
    process.env.MCP_EXECUTE_QUERY_MAX_ROWS = '';

    const config = getRuntimeConfig();

    expect(config.limits.executeQueryMaxRows).toBe(200);
  });

  test('should use fallback for non-numeric port', () => {
    process.env.FIREBIRD_PORT = 'abc';

    const config = getRuntimeConfig();

    expect(config.firebird.port).toBe(3050);
  });

  test('should enable ad-hoc execute query mode when explicitly configured', () => {
    process.env.MCP_EXECUTE_QUERY_MODE = 'ad-hoc';

    const config = getRuntimeConfig();

    expect(config.executeQueryMode).toBe('ad-hoc');
  });

  test('should normalize execute query mode case and whitespace', () => {
    process.env.MCP_EXECUTE_QUERY_MODE = '  Ad-Hoc  ';

    const config = getRuntimeConfig();

    expect(config.executeQueryMode).toBe('ad-hoc');
  });

  test('should fall back to safe execute query mode for invalid values', () => {
    process.env.MCP_EXECUTE_QUERY_MODE = 'unsafe';

    const config = getRuntimeConfig();

    expect(config.executeQueryMode).toBe('safe');
  });

  test('should parse identifier allowlist as uppercase unique values', () => {
    process.env.MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS = 'users, users , public.users,ORDERS';

    const config = getRuntimeConfig();

    expect(config.executeQueryAllowedIdentifiers).toEqual(['USERS', 'PUBLIC.USERS', 'ORDERS']);
  });

  test('should ignore empty identifier allowlist entries', () => {
    process.env.MCP_EXECUTE_QUERY_ALLOWED_IDENTIFIERS = ' ,  ,   ';

    const config = getRuntimeConfig();

    expect(config.executeQueryAllowedIdentifiers).toEqual([]);
  });

  test('should set tools config path when provided', () => {
    process.env.MCP_TOOLS_CONFIG_PATH = './config/tools.json';

    const config = getRuntimeConfig();

    expect(config.toolsConfigPath).toBe('./config/tools.json');
  });

  test('should omit tools config path when only whitespace is provided', () => {
    process.env.MCP_TOOLS_CONFIG_PATH = '   ';

    const config = getRuntimeConfig();

    expect(config.toolsConfigPath).toBeUndefined();
  });

  test('should set toolset when provided', () => {
    process.env.MCP_TOOLSETS = 'schema';

    const config = getRuntimeConfig();

    expect(config.toolsets).toEqual(['schema']);
  });

  test('should omit toolset when only whitespace is provided', () => {
    process.env.MCP_TOOLSETS = '   ';

    const config = getRuntimeConfig();

    expect(config.toolsets).toEqual([]);
  });

  test('should parse comma-separated toolsets and tools from env', () => {
    process.env.MCP_TOOLSETS = 'readonly, schema, ops';
    process.env.MCP_TOOLS = 'ping,list_tables, execute_query';

    const config = getRuntimeConfig();

    expect(config.toolsets).toEqual(['readonly', 'schema', 'ops']);
    expect(config.enabledTools).toEqual(['ping', 'list_tables', 'execute_query']);
  });

  test('should enable tools reload when set to true', () => {
    process.env.MCP_TOOLS_RELOAD_ENABLED = 'true';

    const config = getRuntimeConfig();

    expect(config.toolsReloadEnabled).toBe(true);
  });

  test('should disable tools reload when set to false', () => {
    process.env.MCP_TOOLS_RELOAD_ENABLED = 'false';

    const config = getRuntimeConfig();

    expect(config.toolsReloadEnabled).toBe(false);
  });

  test('should fall back to default for invalid tools reload flag', () => {
    process.env.MCP_TOOLS_RELOAD_ENABLED = 'invalid';

    const config = getRuntimeConfig();

    expect(config.toolsReloadEnabled).toBe(false);
  });

  test('should enable telemetry when flag is true', () => {
    process.env.MCP_TELEMETRY_ENABLED = 'true';

    const config = getRuntimeConfig();

    expect(config.telemetry.enabled).toBe(true);
  });

  test('should parse telemetry exporter and stored span bounds', () => {
    process.env.MCP_TELEMETRY_EXPORTER = 'none';
    process.env.MCP_TELEMETRY_MAX_STORED_SPANS = '5';

    const config = getRuntimeConfig();

    expect(config.telemetry.exporter).toBe('none');
    expect(config.telemetry.maxStoredSpans).toBe(10);
  });

  test('should fall back to logs exporter for unknown telemetry exporter', () => {
    process.env.MCP_TELEMETRY_EXPORTER = 'otlp';

    const config = getRuntimeConfig();

    expect(config.telemetry.exporter).toBe('logs');
  });

  test('should set telemetry client profile when provided', () => {
    process.env.MCP_TELEMETRY_CLIENT_PROFILE = 'vscode';

    const config = getRuntimeConfig();

    expect(config.telemetry.clientProfile).toBe('vscode');
  });

  test('should omit telemetry client profile when only whitespace is provided', () => {
    process.env.MCP_TELEMETRY_CLIENT_PROFILE = '   ';

    const config = getRuntimeConfig();

    expect(config.telemetry.clientProfile).toBeUndefined();
  });

  test('should enable HTTP transport when MCP_TRANSPORT is http', () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_HOST = '127.0.0.1';
    process.env.MCP_HTTP_PORT = '4100';
    process.env.MCP_HTTP_PATH = 'rpc';
    process.env.MCP_HTTP_ALLOWED_ORIGINS = 'http://localhost:3000,https://example.com';

    const config = getRuntimeConfig();

    expect(config.mcpTransport).toBe('http');
    expect(config.http.host).toBe('127.0.0.1');
    expect(config.http.port).toBe(4100);
    expect(config.http.path).toBe('/rpc');
    expect(config.http.allowedOrigins).toEqual(['http://localhost:3000', 'https://example.com']);
  });

  test('should force auth for non-local HTTP host and require token', () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    process.env.MCP_HTTP_AUTH_TOKEN = 'secret-token';

    const config = getRuntimeConfig();

    expect(config.http.requireAuthentication).toBe(true);
    expect(config.http.authToken).toBe('secret-token');
  });

  test('should throw when HTTP transport binds non-local without auth token', () => {
    process.env.MCP_TRANSPORT = 'http';
    process.env.MCP_HTTP_HOST = '0.0.0.0';
    delete process.env.MCP_HTTP_AUTH_TOKEN;

    expect(() => getRuntimeConfig()).toThrow(
      'MCP_HTTP_AUTH_TOKEN is required when MCP_TRANSPORT=http and MCP_HTTP_HOST is non-local',
    );
  });
});
