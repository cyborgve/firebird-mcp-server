import type { McpToolResult } from './types';

export function toolTextResult(payload: unknown, isError?: boolean): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

export function takeAtMost<T>(items: T[], maxItems: number): { values: T[]; truncated: boolean } {
  if (items.length <= maxItems) {
    return {
      values: items,
      truncated: false,
    };
  }

  return {
    values: items.slice(0, maxItems),
    truncated: true,
  };
}
