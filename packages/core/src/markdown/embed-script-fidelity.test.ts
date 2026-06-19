import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import {
  loadLargeEmbedFixtures,
  loadPrd6955Before,
  loadPrd6955CorruptedTriplicated,
} from './fixtures/index.ts';
import { MarkdownManager } from './index.ts';

const mm = new MarkdownManager({ extensions: sharedExtensions });
const mdRoundTrip = (md: string): string => mm.serialize(mm.parse(md));

function extractScriptBodies(doc: string): string[] {
  const bodies: string[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null = re.exec(doc);
  while (m !== null) {
    const body = (m[1] ?? '').trim();
    if (body.length > 0) bodies.push(body);
    m = re.exec(doc);
  }
  return bodies;
}

function jsParses(code: string): boolean {
  try {
    new Function(code);
    return true;
  } catch {
    return false;
  }
}

const BRACE_INJECTION_RE = /\{onst|\{on\{|\{ons\{|\{var\{|\{onst\b/;

describe('O6 — large-embed fixtures: every script is valid JS and survives a round-trip', () => {
  const fixtures = loadLargeEmbedFixtures().filter((f) => f.scriptsMustParse);

  for (const { name, source } of fixtures) {
    test(`${name}: every <script> body parses as JS`, () => {
      const bodies = extractScriptBodies(source);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) expect(jsParses(body)).toBe(true);
    });

    test(`${name}: no brace-injection signature in the source`, () => {
      expect(BRACE_INJECTION_RE.test(source)).toBe(false);
    });

    test(`${name}: a markdown round-trip preserves every script head (still parses, no injection)`, () => {
      const round = mdRoundTrip(source);
      expect(BRACE_INJECTION_RE.test(round)).toBe(false);
      for (const body of extractScriptBodies(round)) expect(jsParses(body)).toBe(true);
    });

    test(`${name}: second-pass round-trip is idempotent (re-render does not drift)`, () => {
      const once = mdRoundTrip(source);
      expect(mdRoundTrip(once)).toBe(once);
    });
  }
});

describe('O6 negative oracle — the PRD-6955 forensic captures', () => {
  test('BEFORE: every script parses and there is no brace-injection signature', () => {
    const before = loadPrd6955Before();
    const bodies = extractScriptBodies(before);
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    for (const body of bodies) expect(jsParses(body)).toBe(true);
    expect(BRACE_INJECTION_RE.test(before)).toBe(false);
  });

  test('CORRUPTED: the brace-injection fingerprint marks heads the clean capture never has', () => {
    const corrupted = loadPrd6955CorruptedTriplicated();
    const before = loadPrd6955Before();
    expect(BRACE_INJECTION_RE.test(before)).toBe(false);
    const injectedHeads = corrupted.split('\n').filter((l) => BRACE_INJECTION_RE.test(l));
    expect(injectedHeads.length).toBeGreaterThanOrEqual(3);
    for (const head of injectedHeads) {
      expect(/^\s*(?:const|let|var)\s+DATA\s*=/.test(head)).toBe(false);
    }
  });

  test('CORRUPTED: the brace-injected scripts fail real JS parse; the clean siblings pass', () => {
    const bodies = extractScriptBodies(loadPrd6955CorruptedTriplicated());
    const injected = bodies.filter((b) => BRACE_INJECTION_RE.test(b));
    const clean = bodies.filter((b) => !BRACE_INJECTION_RE.test(b));
    expect(injected.length).toBeGreaterThanOrEqual(3);
    for (const body of injected) expect(jsParses(body)).toBe(false);
    for (const body of clean) expect(jsParses(body)).toBe(true);
  });

  test('BEFORE: the DATA declaration keyword is intact (the un-corrupted form the fingerprint contrasts with)', () => {
    expect(/\b(?:const|let|var)\s+DATA\s*=/.test(loadPrd6955Before())).toBe(true);
  });
});
