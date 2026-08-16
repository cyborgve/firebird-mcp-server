import type { TelemetryConfig } from '../config/env-config';
import { stderr } from 'node:process';

export type TelemetryAttributes = Record<string, string | number | boolean>;

export interface TelemetrySpanRecord {
  name: string;
  durationMs: number;
  status: 'ok' | 'error';
  timestamp: string;
  attributes?: TelemetryAttributes;
}

export interface TelemetrySnapshot {
  counters: Record<string, number>;
  recentSpans: TelemetrySpanRecord[];
}

export interface TelemetryRecorder {
  incrementCounter(name: string, value?: number, attributes?: TelemetryAttributes): void;
  startSpan(
    name: string,
    attributes?: TelemetryAttributes,
  ): {
    end(status: 'ok' | 'error', attributes?: TelemetryAttributes): void;
  };
  snapshot(): TelemetrySnapshot;
}

function emitTelemetry(
  config: TelemetryConfig,
  kind: 'metric' | 'span',
  payload: Record<string, unknown>,
): void {
  if (!config.enabled || config.exporter !== 'logs') {
    return;
  }

  stderr.write(`${JSON.stringify({ telemetryKind: kind, ...payload })}\n`);
}

export function createTelemetryRecorder(config: TelemetryConfig): TelemetryRecorder {
  const counters = new Map<string, number>();
  const spans: TelemetrySpanRecord[] = [];

  function incrementCounter(name: string, value = 1, attributes?: TelemetryAttributes): void {
    if (!config.enabled) {
      return;
    }

    const current = counters.get(name) ?? 0;
    const next = current + value;
    counters.set(name, next);

    emitTelemetry(config, 'metric', {
      metricName: name,
      metricValue: value,
      metricTotal: next,
      ...(attributes ? { attributes } : {}),
    });
  }

  function startSpan(
    name: string,
    attributes?: TelemetryAttributes,
  ): {
    end(status: 'ok' | 'error', endAttributes?: TelemetryAttributes): void;
  } {
    const startedAt = Date.now();

    return {
      end(status: 'ok' | 'error', endAttributes?: TelemetryAttributes): void {
        if (!config.enabled) {
          return;
        }

        const durationMs = Date.now() - startedAt;
        const span: TelemetrySpanRecord = {
          name,
          durationMs,
          status,
          timestamp: new Date().toISOString(),
          ...(attributes || endAttributes
            ? {
                attributes: {
                  ...(attributes ?? {}),
                  ...(endAttributes ?? {}),
                },
              }
            : {}),
        };

        spans.push(span);
        if (spans.length > config.maxStoredSpans) {
          spans.splice(0, spans.length - config.maxStoredSpans);
        }

        emitTelemetry(config, 'span', {
          spanName: span.name,
          spanDurationMs: span.durationMs,
          spanStatus: span.status,
          ...(span.attributes ? { attributes: span.attributes } : {}),
        });
      },
    };
  }

  function snapshot(): TelemetrySnapshot {
    const counterObject: Record<string, number> = {};
    for (const [name, value] of counters) {
      counterObject[name] = value;
    }

    return {
      counters: counterObject,
      recentSpans: [...spans],
    };
  }

  return {
    incrementCounter,
    startSpan,
    snapshot,
  };
}
