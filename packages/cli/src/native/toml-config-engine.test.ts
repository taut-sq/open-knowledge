import { describe, expect, test } from 'bun:test';
import { createTomlConfigEngine, type NativeTomlBinding } from './toml-config-engine.ts';

const CAPABLE_CASE = 'big = 9223372036854775807\nts = 2026-06-26T12:34:56.123456Z\n';

const NOOP_UPSERT: NativeTomlBinding['upsertMcpServer'] = () => ({
  text: '',
  changed: false,
  existed: false,
});

describe('createTomlConfigEngine', () => {
  test('resolves the native backend and parses values smol-toml rejects', () => {
    const engine = createTomlConfigEngine();
    expect(engine.backend).toBe('native');
    const parsed = engine.parseToObject(CAPABLE_CASE);
    expect(parsed.big).toBeDefined();
    expect(parsed.ts).toBeDefined();
  });

  test('the JS fallback rejects the same integer the native engine accepts', () => {
    const fallback = createTomlConfigEngine(() => null);
    expect(fallback.backend).toBe('fallback');
    expect(() => fallback.parseToObject(CAPABLE_CASE)).toThrow();
  });

  test('the fallback still parses an ordinary config', () => {
    const fallback = createTomlConfigEngine(() => null);
    const parsed = fallback.parseToObject('[mcp_servers.other]\ncommand = "node"\n');
    expect(parsed.mcp_servers).toEqual({ other: { command: 'node' } });
  });

  test('a binding that loads but fails its probe degrades to the fallback', () => {
    const abiMismatch: NativeTomlBinding = {
      parseTomlToJson: () => {
        throw new Error('symbol not found');
      },
      upsertMcpServer: NOOP_UPSERT,
    };
    const engine = createTomlConfigEngine(() => abiMismatch);
    expect(engine.backend).toBe('fallback');
  });

  test('a binding whose probe returns garbage degrades to the fallback', () => {
    const wrongOutput: NativeTomlBinding = {
      parseTomlToJson: () => 'not json at all',
      upsertMcpServer: NOOP_UPSERT,
    };
    expect(createTomlConfigEngine(() => wrongOutput).backend).toBe('fallback');
  });

  test('a healthy injected binding drives the native engine', () => {
    const fake: NativeTomlBinding = {
      parseTomlToJson: (raw) => (raw.includes('probe') ? '{"probe":1}' : '{"injected":true}'),
      upsertMcpServer: NOOP_UPSERT,
    };
    const engine = createTomlConfigEngine(() => fake);
    expect(engine.backend).toBe('native');
    expect(engine.parseToObject('anything')).toEqual({ injected: true });
  });

  test('upsertEntry forwards to the binding and maps text + existed', () => {
    let captured: { toml: string; name: string; json: string } | undefined;
    const fake: NativeTomlBinding = {
      parseTomlToJson: (raw) => (raw.includes('probe') ? '{"probe":1}' : '{}'),
      upsertMcpServer: (toml, name, json) => {
        captured = { toml, name, json };
        return { text: 'edited', changed: true, existed: true };
      },
    };
    const engine = createTomlConfigEngine(() => fake);
    if (engine.backend !== 'native') throw new Error('expected the native engine');
    const result = engine.upsertEntry('x = 1\n', 'open-knowledge', { command: 'c' });
    expect(result).toEqual({ text: 'edited', existed: true });
    expect(captured).toEqual({
      toml: 'x = 1\n',
      name: 'open-knowledge',
      json: '{"command":"c"}',
    });
  });

  test('the real native engine upserts OK’s entry, preserving a sibling', () => {
    const engine = createTomlConfigEngine();
    if (engine.backend !== 'native') throw new Error('native addon must be built for this gate');
    const input = '# keep\n[mcp_servers.other]\ncommand = "node"\n';
    const result = engine.upsertEntry(input, 'open-knowledge', {
      command: '/bin/sh',
      args: ['-l', '-c', 'run'],
    });
    expect(result.existed).toBe(false);
    expect(result.text).toContain('# keep');
    expect(result.text).toContain('[mcp_servers.other]');
    expect(result.text).toContain('[mcp_servers.open-knowledge]');
    const again = engine.upsertEntry(result.text, 'open-knowledge', {
      command: '/bin/sh',
      args: ['-l', '-c', 'run'],
    });
    expect(again.existed).toBe(true);
    expect(again.text).toBe(result.text);
  });

  test('both backends throw on genuinely-malformed TOML', () => {
    expect(() => createTomlConfigEngine().parseToObject('a = = b')).toThrow();
    expect(() => createTomlConfigEngine(() => null).parseToObject('a = = b')).toThrow();
  });

  test('both backends reject a non-table root', () => {
    const arrayRoot: NativeTomlBinding = {
      parseTomlToJson: (raw) => (raw.includes('probe') ? '{"probe":1}' : '[1,2,3]'),
      upsertMcpServer: NOOP_UPSERT,
    };
    expect(() => createTomlConfigEngine(() => arrayRoot).parseToObject('x')).toThrow();
  });
});
