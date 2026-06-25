import { describe, expect, test } from 'bun:test';
import { nextWheelReports, sgrWheelReport, type WheelReportOptions } from './terminal-wheel';

const PIXEL = 0;
const LINE = 1;
const PAGE = 2;

const OPTS: WheelReportOptions = {
  cellHeight: 20,
  sensitivity: 1,
  maxRowsPerEvent: 4,
  viewportRows: 24,
};

/** Drive a sequence of wheel events through the accumulator, returning the
 *  total reports emitted (signed downward) — the user-visible travel. */
function totalReports(deltas: readonly number[], opts: WheelReportOptions = OPTS): number {
  let acc = 0;
  let total = 0;
  for (const deltaY of deltas) {
    const r = nextWheelReports(deltaY, PIXEL, acc, opts);
    acc = r.accumulator;
    total += r.button === 65 ? r.count : -r.count;
  }
  return total;
}

describe('nextWheelReports', () => {
  test('emits one report per whole row of pixel travel (PIXEL mode)', () => {
    const r = nextWheelReports(60, PIXEL, 0, OPTS);
    expect(r.count).toBe(3);
    expect(r.button).toBe(65); // positive deltaY = wheel down
  });

  test('negative delta reports wheel-up (button 64)', () => {
    const r = nextWheelReports(-60, PIXEL, 0, OPTS);
    expect(r.count).toBe(3);
    expect(r.button).toBe(64);
  });

  test('is frequency-independent: same distance over many small events == one big event', () => {
    const many = totalReports(Array.from({ length: 20 }, () => 3));
    const one = totalReports([60]);
    expect(many).toBe(one);
    expect(one).toBe(3);
  });

  test('no dead zone: sub-row events accumulate instead of being dropped', () => {
    const first = nextWheelReports(5, PIXEL, 0, OPTS);
    expect(first.count).toBe(0);
    expect(first.accumulator).toBeCloseTo(0.25);
    expect(totalReports([5, 5, 5, 5])).toBe(1);
  });

  test('per-event count is clamped to maxRowsPerEvent (momentum-spike guard)', () => {
    const r = nextWheelReports(200, PIXEL, 0, OPTS);
    expect(r.count).toBe(4);
  });

  test('clamped excess is discarded (only the fractional remainder carries)', () => {
    const r = nextWheelReports(205, PIXEL, 0, OPTS);
    expect(r.count).toBe(4);
    expect(r.accumulator).toBeCloseTo(0.25);
  });

  test('reversing direction nets out at the sign boundary (frequency-independent)', () => {
    const down = nextWheelReports(30, PIXEL, 0, OPTS);
    expect(down.count).toBe(1);
    expect(down.button).toBe(65);
    expect(down.accumulator).toBeCloseTo(0.5);
    const up = nextWheelReports(-30, PIXEL, down.accumulator, OPTS);
    expect(up.count).toBe(1);
    expect(up.button).toBe(64);
    expect(up.accumulator).toBeCloseTo(0);
  });

  test('LINE mode counts deltaY directly as rows', () => {
    const r = nextWheelReports(3, LINE, 0, OPTS);
    expect(r.count).toBe(3);
    expect(r.button).toBe(65);
  });

  test('PAGE mode scales by the viewport row count', () => {
    const r = nextWheelReports(1, PAGE, 0, OPTS);
    expect(r.count).toBe(4);
  });

  test('sensitivity scales total travel linearly', () => {
    const base = totalReports([100]);
    const half = totalReports([100], { ...OPTS, sensitivity: 0.5 });
    expect(half).toBe(Math.trunc(base / 2));
  });
});

describe('sgrWheelReport', () => {
  test('encodes SGR wheel up/down press at position 1;1', () => {
    expect(sgrWheelReport(64)).toBe('\x1b[<64;1;1M');
    expect(sgrWheelReport(65)).toBe('\x1b[<65;1;1M');
  });
});
