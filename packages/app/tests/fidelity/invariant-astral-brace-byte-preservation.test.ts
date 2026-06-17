
import { describe, expect, test } from 'bun:test';
import { mdRoundTrip } from './helpers';

describe('Astral codepoint before an unmatched brace — embed bytes survive parse→serialize', () => {
  test('4 astral codepoints before a JS embed — embed round-trips byte-identical', () => {
    const src =
      '\u{1F3A3}\u{1F9AD}\u{1F3A3}\u{1F9AD} fishing log\n\n```js\n(function () {\n\n  const DATA = { track: 1 };\n})();\n```\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('1 astral codepoint before a JS embed — embed round-trips byte-identical', () => {
    const src =
      '\u{1F3A3} fishing log\n\n```js\n(function () {\n\n  const DATA = { track: 1 };\n})();\n```\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('control: same embed with BMP prose round-trips byte-identical (baseline)', () => {
    const src =
      'xxxx fishing log\n\n```js\n(function () {\n\n  const DATA = { track: 1 };\n})();\n```\n';
    expect(mdRoundTrip(src)).toBe(src);
  });
});
