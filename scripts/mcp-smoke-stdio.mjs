#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_TIMEOUT_MS = 5000;
const REQUIRED_TOOLS = [
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
];

function parseArgs(argv) {
  const args = { out: null, timeoutMs: DEFAULT_TIMEOUT_MS };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--out') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --out');
      }
      args.out = value;
      index += 1;
      continue;
    }

    if (token === '--timeout-ms') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Invalid value for --timeout-ms');
      }
      args.timeoutMs = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting process exit after ${timeoutMs}ms`));
    }, timeoutMs);

    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function main() {
  const { out, timeoutMs } = parseArgs(process.argv.slice(2));

  const summary = {
    startedAt: nowIso(),
    transport: 'stdio',
    command: 'node dist/server.js',
    checks: [],
    success: false,
    errors: [],
    finishedAt: null,
  };

  let nextId = 1;
  const pending = new Map();
  const stdoutLines = [];
  const stderrLines = [];

  const child = spawn('node', ['dist/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MCP_TRANSPORT: 'stdio',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdoutReader = createInterface({ input: child.stdout });
  const stderrReader = createInterface({ input: child.stderr });

  stdoutReader.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    stdoutLines.push(trimmed);

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
      return;
    }

    const pendingEntry = pending.get(message.id);
    if (!pendingEntry) {
      return;
    }

    clearTimeout(pendingEntry.timeout);
    pending.delete(message.id);
    pendingEntry.resolve(message);
  });

  stderrReader.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed) {
      stderrLines.push(trimmed);
    }
  });

  function sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;

      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting response for ${method}`));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timeout });

      const payload = {
        jsonrpc: '2.0',
        id,
        method,
      };

      if (params !== undefined) {
        payload.params = params;
      }

      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  function sendNotification(method, params) {
    const payload = {
      jsonrpc: '2.0',
      method,
    };

    if (params !== undefined) {
      payload.params = params;
    }

    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async function runCheck(name, execute) {
    const startedAt = Date.now();
    try {
      const details = await execute();
      summary.checks.push({
        name,
        status: 'passed',
        durationMs: Date.now() - startedAt,
        details,
      });
      return details;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.checks.push({
        name,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        details: { error: message },
      });
      summary.errors.push(`${name}: ${message}`);
      throw error;
    }
  }

  try {
    const initialize = await runCheck('initialize', async () => {
      const response = await sendRequest('initialize', { protocolVersion: '2025-06-18' });

      if (!response.result || response.error) {
        throw new Error('Initialize did not return a successful result');
      }

      return {
        protocolVersion: response.result.protocolVersion,
        serverName: response.result.serverInfo?.name,
      };
    });

    sendNotification('notifications/initialized');

    const toolsList = await runCheck('tools/list', async () => {
      const response = await sendRequest('tools/list');
      if (!response.result || response.error) {
        throw new Error('tools/list returned an error');
      }

      const tools = Array.isArray(response.result.tools)
        ? response.result.tools.map((tool) => tool.name).filter((name) => typeof name === 'string')
        : [];

      const missingTools = REQUIRED_TOOLS.filter((tool) => !tools.includes(tool));
      if (missingTools.length > 0) {
        throw new Error(`Missing expected tools: ${missingTools.join(', ')}`);
      }

      return {
        totalTools: tools.length,
        requiredToolsPresent: true,
      };
    });

    await runCheck('tools/call ping', async () => {
      const response = await sendRequest('tools/call', { name: 'ping' });
      if (response.error) {
        throw new Error(`ping failed: ${response.error.message}`);
      }

      return {
        hasContent: Array.isArray(response.result?.content),
        hasStructuredContent: typeof response.result?.structuredContent === 'object',
      };
    });

    await runCheck('tools/call list_tables', async () => {
      const response = await sendRequest('tools/call', { name: 'list_tables' });
      if (response.error) {
        throw new Error(`list_tables failed: ${response.error.message}`);
      }

      const tableCount = Array.isArray(response.result?.structuredContent?.tables)
        ? response.result.structuredContent.tables.length
        : undefined;

      return {
        hasContent: Array.isArray(response.result?.content),
        tableCount,
      };
    });

    await runCheck('tools/call execute_query mutation blocked', async () => {
      const response = await sendRequest('tools/call', {
        name: 'execute_query',
        arguments: {
          sql: 'DELETE FROM RDB$DATABASE',
        },
      });

      if (!response.error) {
        throw new Error('execute_query mutation was not blocked');
      }

      return {
        errorCode: response.error.code,
        errorMessage: response.error.message,
      };
    });

    summary.success = true;

    console.log(
      'Smoke checks passed: initialize, tools/list, ping, list_tables, execute_query mutation guard.',
    );
    console.log(
      `Server: ${initialize.serverName ?? 'unknown'} | Protocol: ${initialize.protocolVersion ?? 'unknown'}`,
    );
    console.log(`Required tools check: ${toolsList.totalTools} tools available.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Smoke checks failed: ${message}`);
  } finally {
    summary.finishedAt = nowIso();
    summary.stdoutLineCount = stdoutLines.length;
    summary.stderrLineCount = stderrLines.length;

    child.kill('SIGINT');

    try {
      summary.processExit = await waitForExit(child, timeoutMs);
    } catch (error) {
      summary.errors.push(
        error instanceof Error ? `shutdown: ${error.message}` : `shutdown: ${String(error)}`,
      );
      summary.processExit = { code: null, signal: null };
    }

    if (out) {
      const outPath = path.isAbsolute(out) ? out : path.join(process.cwd(), out);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
      console.log(`Smoke evidence written to: ${outPath}`);
    }

    if (!summary.success) {
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal smoke runner error: ${message}`);
  process.exitCode = 1;
});
