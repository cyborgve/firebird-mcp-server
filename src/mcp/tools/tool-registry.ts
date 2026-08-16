import type { McpToolHandler, McpToolDefinition } from './types';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pingTool } from './ping';
import { serverStatusTool } from './server-status';
import { listTablesTool } from './list-tables';
import { getTableSchemaTool } from './get-table-schema';
import { getDatabaseSchemaTool } from './get-database-schema';
import { executeQueryTool } from './execute-query';
import { explainQueryPlanTool } from './explain-query-plan';
import { listIndexesTool } from './list-indexes';
import { listConstraintsTool } from './list-constraints';
import { databaseOverviewTool } from './database-overview';
import { getEntityRelationshipsTool } from './get-entity-relationships';
import { getTableStatisticsTool } from './get-table-statistics';
import { analyzeIndexUsageTool } from './analyze-index-usage';
import { backupDatabaseTool } from './backup-database';
import { logger } from '../../logging/logger';

/**
 * Centralized registry maintaining a static catalog of all registered MCP tool handlers.
 *
 * To introduce a new capabilities tool:
 * 1. Implement a new module adhering strictly to the `McpToolHandler` interface.
 * 2. Export the instance and append it to the `ALL_TOOLS` collection here.
 */
const ALL_TOOLS: readonly McpToolHandler[] = [
  pingTool,
  serverStatusTool,
  listTablesTool,
  getTableSchemaTool,
  getDatabaseSchemaTool,
  executeQueryTool,
  explainQueryPlanTool,
  listIndexesTool,
  listConstraintsTool,
  databaseOverviewTool,
  getEntityRelationshipsTool,
  getTableStatisticsTool,
  analyzeIndexUsageTool,
  backupDatabaseTool,
];

interface ExternalToolsConfig {
  enabledTools: string[];
}

export interface CreateToolRegistryOptions {
  externalConfigPath?: string;
  activeToolsets?: string[];
  enabledTools?: string[];
  pageSize?: number;
}

const SCHEMA_TOOL_NAMES: readonly string[] = [
  'ping',
  'server_status',
  'list_tables',
  'get_table_schema',
  'get_database_schema',
  'list_indexes',
  'list_constraints',
  'database_overview',
  'get_entity_relationships',
  'get_table_statistics',
  'analyze_index_usage',
];

const READONLY_TOOL_NAMES: readonly string[] = [
  ...SCHEMA_TOOL_NAMES,
  'explain_query_plan',
  'execute_query',
];

const BUILTIN_TOOLSETS: Readonly<Record<string, readonly string[]>> = {
  readonly: READONLY_TOOL_NAMES,
  schema: SCHEMA_TOOL_NAMES,
  ops: ['ping', 'server_status'],
};

export interface ToolRegistry {
  getToolDefinitions(cursor?: string): {
    tools: McpToolDefinition[];
    nextCursor?: string;
  };
  getToolHandler(name: string): McpToolHandler | undefined;
  getToolCount(): number;
}

/**
 * Establishes the default page size enforcing limits on cursor-based pagination during `tools/list` resolution.
 */
const DEFAULT_PAGE_SIZE = 50;

function parseYamlList(text: string): ExternalToolsConfig | null {
  const enabledTools: string[] = [];
  let inEnabledTools = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const topLevelKey = /^([A-Za-z0-9_]+)\s*:\s*(.*)$/.exec(line);
    if (topLevelKey) {
      const key = topLevelKey[1];
      const tail = topLevelKey[2]?.trim() ?? '';

      if (key === 'enabledTools') {
        inEnabledTools = true;
        if (tail.startsWith('[') && tail.endsWith(']')) {
          const inlineValues = tail
            .slice(1, -1)
            .split(',')
            .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
            .filter((item) => item.length > 0);
          enabledTools.push(...inlineValues);
        }
      } else {
        inEnabledTools = false;
      }

      continue;
    }

    if (!inEnabledTools) {
      continue;
    }

    const listItem = /^\s*-\s*(.+)$/.exec(line);
    if (!listItem) {
      continue;
    }

    const rawValue = listItem[1];
    if (!rawValue) {
      continue;
    }

    const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
    if (value.length > 0) {
      enabledTools.push(value);
    }
  }

  return { enabledTools };
}

function parseExternalToolsConfig(filePath: string, content: string): ExternalToolsConfig | null {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.json') {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const enabledTools = (parsed as { enabledTools?: unknown }).enabledTools;
    if (!Array.isArray(enabledTools) || !enabledTools.every((item) => typeof item === 'string')) {
      return null;
    }

    return { enabledTools };
  }

  if (extension === '.yaml' || extension === '.yml') {
    return parseYamlList(content);
  }

  return null;
}

function selectHandlersFromExternalConfig(
  handlers: readonly McpToolHandler[],
  externalConfigPath: string | undefined,
): readonly McpToolHandler[] {
  if (!externalConfigPath) {
    return handlers;
  }

  const resolvedPath = path.isAbsolute(externalConfigPath)
    ? externalConfigPath
    : path.resolve(process.cwd(), externalConfigPath);

  if (!existsSync(resolvedPath)) {
    logger.warning('Tools config file not found, using default registry', {
      toolsConfigPath: resolvedPath,
    });
    return handlers;
  }

  try {
    const content = readFileSync(resolvedPath, 'utf8');
    const parsed = parseExternalToolsConfig(resolvedPath, content);

    if (!parsed) {
      logger.warning('Invalid tools config file, using default registry', {
        toolsConfigPath: resolvedPath,
      });
      return handlers;
    }

    const handlersByName = new Map(handlers.map((tool) => [tool.definition.name, tool]));
    const selected: McpToolHandler[] = [];
    const unknownTools: string[] = [];
    const seen = new Set<string>();

    for (const rawName of parsed.enabledTools) {
      const name = rawName.trim();
      if (!name || seen.has(name)) {
        continue;
      }

      seen.add(name);
      const handler = handlersByName.get(name);
      if (!handler) {
        unknownTools.push(name);
        continue;
      }

      selected.push(handler);
    }

    if (unknownTools.length > 0) {
      logger.warning('Unknown tools in external config were ignored', {
        toolsConfigPath: resolvedPath,
        unknownTools,
      });
    }

    logger.info('External tools config loaded', {
      toolsConfigPath: resolvedPath,
      selectedTools: selected.map((tool) => tool.definition.name),
    });

    return selected;
  } catch {
    logger.warning('Failed to parse tools config file, using default registry', {
      toolsConfigPath: resolvedPath,
    });
    return handlers;
  }
}

function applyToolsetSelection(
  handlers: readonly McpToolHandler[],
  activeToolsets: readonly string[] | undefined,
): readonly McpToolHandler[] {
  const requestedToolsets = (activeToolsets ?? [])
    .map((toolset) => toolset.trim().toLowerCase())
    .filter((toolset) => toolset.length > 0);

  if (requestedToolsets.length === 0) {
    return handlers;
  }

  const allowed = new Set<string>();
  const unknownToolsets: string[] = [];

  for (const toolsetName of requestedToolsets) {
    const toolset = BUILTIN_TOOLSETS[toolsetName];
    if (!toolset) {
      unknownToolsets.push(toolsetName);
      continue;
    }

    for (const toolName of toolset) {
      allowed.add(toolName);
    }
  }

  if (unknownToolsets.length > 0) {
    logger.warning('Unknown toolset profile(s) ignored', {
      toolsets: unknownToolsets,
    });
  }

  if (allowed.size === 0) {
    return handlers;
  }

  const selected = handlers.filter((handler) => allowed.has(handler.definition.name));

  logger.info('Toolset profile applied', {
    toolsets: requestedToolsets,
    selectedTools: selected.map((handler) => handler.definition.name),
  });

  return selected;
}

function applyExplicitToolSelection(
  handlers: readonly McpToolHandler[],
  enabledTools: readonly string[] | undefined,
): readonly McpToolHandler[] {
  if (!enabledTools || enabledTools.length === 0) {
    return handlers;
  }

  const requestedTools = new Set(
    enabledTools.map((toolName) => toolName.trim()).filter((toolName) => toolName.length > 0),
  );

  if (requestedTools.size === 0) {
    return handlers;
  }

  const selected = handlers.filter((handler) => requestedTools.has(handler.definition.name));

  logger.info('Explicit tool allowlist applied', {
    selectedTools: selected.map((handler) => handler.definition.name),
  });

  return selected;
}

function normalizeRegistryOptions(
  options?: string | CreateToolRegistryOptions,
): CreateToolRegistryOptions {
  if (typeof options === 'string') {
    return { externalConfigPath: options };
  }

  return options ?? {};
}

function getToolDefinitionsFromHandlers(
  handlers: readonly McpToolHandler[],
  pageSize: number,
  cursor?: string,
): {
  tools: McpToolDefinition[];
  nextCursor?: string;
} {
  const offset = decodeCursor(cursor);
  const page = handlers.slice(offset, offset + pageSize).map((tool) => tool.definition);

  const nextOffset = offset + pageSize;
  const hasMore = nextOffset < handlers.length;

  return {
    tools: page,
    ...(hasMore ? { nextCursor: encodeCursor(nextOffset) } : {}),
  };
}

export function createToolRegistry(options?: string | CreateToolRegistryOptions): ToolRegistry {
  const normalizedOptions = normalizeRegistryOptions(options);

  const handlersFromConfig = selectHandlersFromExternalConfig(
    ALL_TOOLS,
    normalizedOptions.externalConfigPath,
  );
  const selectedHandlers = applyToolsetSelection(
    handlersFromConfig,
    normalizedOptions.activeToolsets,
  );
  const filteredHandlers = applyExplicitToolSelection(
    selectedHandlers,
    normalizedOptions.enabledTools,
  );
  const toolsByName = new Map<string, McpToolHandler>(
    filteredHandlers.map((tool) => [tool.definition.name, tool]),
  );

  return {
    getToolDefinitions(cursor?: string) {
      return getToolDefinitionsFromHandlers(
        filteredHandlers,
        normalizedOptions.pageSize ?? DEFAULT_PAGE_SIZE,
        cursor,
      );
    },

    getToolHandler(name: string) {
      return toolsByName.get(name);
    },

    getToolCount() {
      return filteredHandlers.length;
    },
  };
}

const defaultRegistry = createToolRegistry();

/**
 * Serves a paginated slice of registered tool definitions using strictly opaque cursor resolution.
 *
 * In compliance with the MCP specification, cursors act as opaque scalars; clients must not assume internal structure.
 * The underlying mechanism applies a safe base64 encoding over deterministic array offsets.
 *
 * @param cursor - An opaque cursor token provided from a prior response, or `undefined` to initiate from the beginning.
 * @returns An object encapsulating the localized `tools` page segment and a subsequent `nextCursor` token if further pages remain.
 */
export function getToolDefinitions(cursor?: string): {
  tools: McpToolDefinition[];
  nextCursor?: string;
} {
  return defaultRegistry.getToolDefinitions(cursor);
}

/**
 * Performs an O(1) exact-match resolution mapping a tool name strictly to its registered handler implementation.
 *
 * @param name - The canonical exact name of the registered tool.
 * @returns The successfully resolved `McpToolHandler` instance, or `undefined` if no correlation exists.
 */
export function getToolHandler(name: string): McpToolHandler | undefined {
  return defaultRegistry.getToolHandler(name);
}

/**
 * Calculates the total aggregate operational count of statically registered tools.
 *
 * @returns The integer sum of presently registered tool capabilities.
 */
export function getToolCount(): number {
  return defaultRegistry.getToolCount();
}

function encodeCursor(offset: number): string {
  return Buffer.from(`offset:${offset}`).toString('base64url');
}

function decodeCursor(cursor?: string): number {
  if (!cursor) {
    return 0;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const match = /^offset:(\d+)$/.exec(decoded);
    if (!match) {
      return 0;
    }

    return Number(match[1]);
  } catch {
    return 0;
  }
}
