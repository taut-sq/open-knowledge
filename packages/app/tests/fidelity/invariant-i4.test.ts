
import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { paragraphWithFidelityChars } from './arbitraries';
import { mdRoundTrip, NUM_RUNS, normalize } from './helpers';

describe('I4 — idempotence: two round-trips produce identical output', () => {

  test('fidelity chars idempotence', () => {
    fc.assert(
      fc.property(paragraphWithFidelityChars, (md) => {
        const rt1 = normalize(mdRoundTrip(md));
        const rt2 = normalize(mdRoundTrip(rt1));
        expect(rt2).toBe(rt1);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
