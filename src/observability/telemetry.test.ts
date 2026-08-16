import { describe, expect, test, vi, afterEach } from 'vitest';
import { createTelemetryRecorder } from './telemetry';

describe('telemetry recorder', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should track counters and spans when enabled', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const telemetry = createTelemetryRecorder({
      enabled: true,
      exporter: 'logs',
      maxStoredSpans: 10,
    });

    telemetry.incrementCounter('mcp.request.received');
    const span = telemetry.startSpan('mcp.tools.call', { toolName: 'ping' });
    span.end('ok');

    const snapshot = telemetry.snapshot();
    expect(snapshot.counters['mcp.request.received']).toBe(1);
    expect(snapshot.recentSpans).toHaveLength(1);
    expect(snapshot.recentSpans[0]?.name).toBe('mcp.tools.call');
    expect(snapshot.recentSpans[0]?.status).toBe('ok');
    expect(writeSpy).toHaveBeenCalled();
  });

  test('should not emit telemetry when disabled', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const telemetry = createTelemetryRecorder({
      enabled: false,
      exporter: 'logs',
      maxStoredSpans: 10,
    });

    telemetry.incrementCounter('mcp.request.received');
    const span = telemetry.startSpan('mcp.tools.call');
    span.end('error');

    const snapshot = telemetry.snapshot();
    expect(snapshot.counters).toEqual({});
    expect(snapshot.recentSpans).toEqual([]);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  test('should cap stored span history to maxStoredSpans', () => {
    const telemetry = createTelemetryRecorder({
      enabled: true,
      exporter: 'none',
      maxStoredSpans: 2,
    });

    telemetry.startSpan('span-1').end('ok');
    telemetry.startSpan('span-2').end('ok');
    telemetry.startSpan('span-3').end('error');

    const snapshot = telemetry.snapshot();
    expect(snapshot.recentSpans).toHaveLength(2);
    expect(snapshot.recentSpans[0]?.name).toBe('span-2');
    expect(snapshot.recentSpans[1]?.name).toBe('span-3');
  });

  test('should emit telemetry payload with stable dimensions', () => {
    let captured = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((data: string | Uint8Array) => {
      captured += String(data);
      return true;
    });

    const telemetry = createTelemetryRecorder({
      enabled: true,
      exporter: 'logs',
      maxStoredSpans: 10,
    });

    telemetry.incrementCounter('mcp.tools.call.success', 1, {
      clientProfile: 'vscode',
      toolName: 'ping',
    });
    telemetry.startSpan('mcp.tools.call', { clientProfile: 'vscode' }).end('ok', {
      toolName: 'ping',
    });

    const lines = captured
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    const telemetryEvents = lines.filter((line) => line.telemetryKind !== undefined);
    expect(telemetryEvents.length).toBe(2);

    const metricEvent = telemetryEvents.find((event) => event.telemetryKind === 'metric');
    const spanEvent = telemetryEvents.find((event) => event.telemetryKind === 'span');

    expect((metricEvent?.attributes as Record<string, unknown>).clientProfile).toBe('vscode');
    expect((metricEvent?.attributes as Record<string, unknown>).toolName).toBe('ping');
    expect((spanEvent?.attributes as Record<string, unknown>).clientProfile).toBe('vscode');
    expect((spanEvent?.attributes as Record<string, unknown>).toolName).toBe('ping');
  });

  test('should not write telemetry logs when exporter is none', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const telemetry = createTelemetryRecorder({
      enabled: true,
      exporter: 'none',
      maxStoredSpans: 10,
    });

    telemetry.incrementCounter('mcp.request.received');
    telemetry.startSpan('mcp.tools.list').end('ok');

    expect(writeSpy).not.toHaveBeenCalled();
    const snapshot = telemetry.snapshot();
    expect(snapshot.counters['mcp.request.received']).toBe(1);
    expect(snapshot.recentSpans).toHaveLength(1);
  });
});
