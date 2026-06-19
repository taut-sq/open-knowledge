import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { protectFromMdx } from './autolink-void-html-guard.ts';

function restoreString(s: string): string {
  return s
    .replaceAll('\u{E000}', '<')
    .replaceAll('\u{E001}', '>')
    .replaceAll('\u{E002}', ':')
    .replaceAll('\u{E003}', '@')
    .replaceAll('\u{E004}', '{');
}

const roundTrip = (s: string) => restoreString(protectFromMdx(s));
const countBraces = (s: string) => [...s].filter((c) => c === '{').length;

describe('R23 brace guard: astral codepoint before an unmatched brace', () => {
  const buildInput = (k: number) => `${'\u{1F3A3}'.repeat(k)}a{bcdefgh`;

  for (let k = 0; k <= 4; k++) {
    test(`protect->restore is identity with ${k} astral codepoint(s) before the brace`, () => {
      const input = buildInput(k);
      expect(roundTrip(input)).toBe(input);
    });
  }

  test('restore mints no brace the input did not contain', () => {
    const input = '\u{1F3A3}\u{1F9AD}\u{1F3A3}\u{1F9AD}a{bcdefghij';
    expect(countBraces(roundTrip(input))).toBe(countBraces(input));
  });

  test('astral before a brace flushed at a blockquote boundary', () => {
    const input = '\u{1F3A3}a{\n>}rest';
    expect(roundTrip(input)).toBe(input);
  });

  test('protect->restore identity holds for astral-bearing inputs (closes the BMP-only generator gap)', () => {
    const astralOrBmp = fc
      .array(
        fc.oneof(
          fc.constantFrom('\u{1F3A3}', '\u{1F9AD}', '\u{1F600}', '\u{1F9EA}', '\u{1F30A}'),
          fc.constantFrom(...'abc {}>\n'),
        ),
        { maxLength: 60 },
      )
      .map((parts) => parts.join(''));
    for (const seed of [42, 137, 2718, 31415, 99991]) {
      fc.assert(
        fc.property(astralOrBmp, (s) => {
          expect(roundTrip(s)).toBe(s);
        }),
        { numRuns: 200, seed },
      );
    }
  });
});
