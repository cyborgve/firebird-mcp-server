import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createToolRegistry,
  getToolDefinitions,
  getToolHandler,
  getToolCount,
} from './tool-registry';

describe('tool-registry', () => {
  test('getToolCount should return total number of registered tools', () => {
    expect(getToolCount()).toBeGreaterThanOrEqual(10);
  });

  test('getToolDefinitions without cursor should return first page', () => {
    const result = getToolDefinitions();

    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThanOrEqual(10);

    // All tools should have required fields
    for (const tool of result.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.additionalProperties).toBe(false);
      if (tool.name !== 'backup_database') {
        expect(tool.annotations?.readOnlyHint).toBe(true);
      }
    }
  });

  test('execute_query should be marked as read-only and non-idempotent', () => {
    const result = getToolDefinitions();
    const executeQueryTool = result.tools.find((tool) => tool.name === 'execute_query');

    expect(executeQueryTool).toBeDefined();
    expect(executeQueryTool?.annotations?.readOnlyHint).toBe(true);
    expect(executeQueryTool?.annotations?.idempotentHint).toBe(false);
    expect(executeQueryTool?.annotations?.openWorldHint).toBe(false);
  });

  test('getToolDefinitions should not include nextCursor when all tools fit in one page', () => {
    const result = getToolDefinitions();

    // With current tool count and a page size of 50, all fit in one page
    expect(result.nextCursor).toBeUndefined();
  });

  test('getToolDefinitions with invalid cursor should return first page', () => {
    const result = getToolDefinitions('invalid-cursor');

    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThanOrEqual(10);
  });

  test('getToolDefinitions with empty string cursor should return first page', () => {
    const resultEmpty = getToolDefinitions('');
    const resultUndefined = getToolDefinitions();

    expect(resultEmpty.tools.length).toBe(resultUndefined.tools.length);
  });

  test('getToolHandler should return handler for known tool', () => {
    const handler = getToolHandler('ping');

    expect(handler).toBeDefined();
    expect(handler?.definition.name).toBe('ping');
  });

  test('getToolHandler should return undefined for unknown tool', () => {
    const handler = getToolHandler('nonexistent_tool');

    expect(handler).toBeUndefined();
  });

  test('all registered tool names should be unique', () => {
    const result = getToolDefinitions();
    const names = result.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every tool in definitions should be resolvable via getToolHandler', () => {
    const result = getToolDefinitions();

    for (const tool of result.tools) {
      const handler = getToolHandler(tool.name);
      expect(handler).toBeDefined();
      expect(handler?.definition.name).toBe(tool.name);
    }
  });

  test('createToolRegistry should filter tools from external JSON config', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fb-mcp-tools-json-'));

    try {
      const configPath = path.join(tmpDir, 'tools.json');
      writeFileSync(
        configPath,
        JSON.stringify({ enabledTools: ['ping', 'list_tables', 'unknown_tool'] }),
        'utf8',
      );

      const registry = createToolRegistry(configPath);

      expect(registry.getToolCount()).toBe(2);
      expect(registry.getToolHandler('ping')).toBeDefined();
      expect(registry.getToolHandler('list_tables')).toBeDefined();
      expect(registry.getToolHandler('server_status')).toBeUndefined();
      expect(registry.getToolDefinitions().tools.map((tool) => tool.name)).toEqual([
        'ping',
        'list_tables',
      ]);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('createToolRegistry should filter tools from external YAML config', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fb-mcp-tools-yaml-'));

    try {
      const configPath = path.join(tmpDir, 'tools.yaml');
      writeFileSync(configPath, 'enabledTools:\n  - ping\n  - execute_query\n', 'utf8');

      const registry = createToolRegistry(configPath);

      expect(registry.getToolCount()).toBe(2);
      expect(registry.getToolHandler('ping')).toBeDefined();
      expect(registry.getToolHandler('execute_query')).toBeDefined();
      expect(registry.getToolHandler('get_database_schema')).toBeUndefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('createToolRegistry should fall back to default tools when external config is invalid', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fb-mcp-tools-invalid-'));

    try {
      const configPath = path.join(tmpDir, 'tools.json');
      writeFileSync(configPath, '{"enabledTools": "not-an-array"}', 'utf8');

      const registry = createToolRegistry(configPath);

      expect(registry.getToolCount()).toBeGreaterThanOrEqual(10);
      expect(registry.getToolHandler('ping')).toBeDefined();
      expect(registry.getToolHandler('execute_query')).toBeDefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('createToolRegistry should apply built-in ops toolset', () => {
    const registry = createToolRegistry({ activeToolsets: ['ops'] });

    expect(registry.getToolDefinitions().tools.map((tool) => tool.name)).toEqual([
      'ping',
      'server_status',
    ]);
    expect(registry.getToolHandler('list_tables')).toBeUndefined();
  });

  test('createToolRegistry should combine multiple built-in toolsets', () => {
    const registry = createToolRegistry({ activeToolsets: ['readonly', 'ops'] });

    expect(registry.getToolDefinitions().tools.map((tool) => tool.name)).toEqual([
      'ping',
      'server_status',
      'list_tables',
      'get_table_schema',
      'get_database_schema',
      'execute_query',
      'explain_query_plan',
      'list_indexes',
      'list_constraints',
      'database_overview',
      'get_entity_relationships',
      'get_table_statistics',
      'analyze_index_usage',
    ]);
  });

  test('createToolRegistry should apply explicit tool allowlist after toolset filtering', () => {
    const registry = createToolRegistry({
      activeToolsets: ['readonly'],
      enabledTools: ['ping', 'list_tables'],
    });

    expect(registry.getToolDefinitions().tools.map((tool) => tool.name)).toEqual([
      'ping',
      'list_tables',
    ]);
  });

  test('createToolRegistry should apply toolset after external config filtering', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'fb-mcp-tools-toolset-'));

    try {
      const configPath = path.join(tmpDir, 'tools.json');
      writeFileSync(
        configPath,
        JSON.stringify({ enabledTools: ['ping', 'server_status', 'list_tables'] }),
        'utf8',
      );

      const registry = createToolRegistry({
        externalConfigPath: configPath,
        activeToolsets: ['ops'],
      });

      expect(registry.getToolDefinitions().tools.map((tool) => tool.name)).toEqual([
        'ping',
        'server_status',
      ]);
      expect(registry.getToolHandler('list_tables')).toBeUndefined();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
