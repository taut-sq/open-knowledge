import { describe, expect, test } from 'bun:test';
import {
  loadIndentedJsxFixtures,
  loadLargeEmbedFixtures,
  loadPrd6955Before,
  loadPrd6955CorruptedTriplicated,
} from './index.ts';

describe('shared MDX corpus ratchet', () => {
  test('the indented-JSX corpus retains a container shape and the real github-sync 4-Step', () => {
    const fixtures = loadIndentedJsxFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
    expect(fixtures.some((f) => /<Steps?>|<Tabs?>/.test(f.source))).toBe(true);
    expect(fixtures.some((f) => f.name.includes('github-sync'))).toBe(true);
    for (const f of fixtures) expect(f.source.trim().length).toBeGreaterThan(0);
  });

  test('the large-embed corpus retains an html-preview embed with a script', () => {
    const fixtures = loadLargeEmbedFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(1);
    expect(
      fixtures.some((f) => /```html[^\n]*preview/.test(f.source) && f.source.includes('<script')),
    ).toBe(true);
  });

  test('the PRD-6955 byte-exact regression captures are present and intact', () => {
    const before = loadPrd6955Before();
    const corrupted = loadPrd6955CorruptedTriplicated();
    expect(before.split('\n').length).toBeGreaterThan(200);
    expect(corrupted.split('\n').length).toBeGreaterThan(600);
    expect(corrupted.length).toBeGreaterThan(before.length * 2);
    expect(/\{onst|\{on\{|\{ons\{|\{var\{/.test(corrupted)).toBe(true);
    expect(/\{onst|\{on\{|\{ons\{|\{var\{/.test(before)).toBe(false);
  });
});
