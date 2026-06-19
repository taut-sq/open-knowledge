import { afterEach, describe, expect, test } from 'bun:test';

import { BRIDGE_TOLERANCE_CLASSES, type BridgeToleranceClass } from './normalize.ts';
import {
  classifySeverity,
  emitToleranceFire,
  findFirstDivergenceIndex,
  setToleranceTelemetryHook,
  type ToleranceFireRecord,
} from './tolerance-telemetry.ts';

afterEach(() => {
  setToleranceTelemetryHook(null);
});

describe('classifySeverity', () => {
  const pmModelCaused: BridgeToleranceClass[] = ['emphasis-around-code'];
  const parserCaused: BridgeToleranceClass[] = [
    'bom',
    'crlf',
    'commonmark-escape',
    'leading-newline',
    'doc-start-thematic',
    'paragraph-continuation-indent',
  ];
  const serializerCaused: BridgeToleranceClass[] = [
    'block-separator-collapse',
    'table-align-row-spacing',
    'row-no-trailing-pipe',
    'ordered-list-marker-number',
    'list-indent-canonical',
    'jsx-container-boundary-blank',
    'trailing-whitespace',
    'blank-line-collapse',
    'trailing-newline',
  ];

  test('pm-model-caused classes', () => {
    for (const cls of pmModelCaused) {
      expect(classifySeverity(cls)).toBe('pm-model-caused');
    }
  });

  test('parser-caused classes', () => {
    for (const cls of parserCaused) {
      expect(classifySeverity(cls)).toBe('parser-caused');
    }
  });

  test('serializer-caused classes', () => {
    for (const cls of serializerCaused) {
      expect(classifySeverity(cls)).toBe('serializer-caused');
    }
  });

  test('the severity buckets partition every bridge tolerance class', () => {
    const bucketed = [...pmModelCaused, ...parserCaused, ...serializerCaused];
    expect(new Set(bucketed).size).toBe(bucketed.length);
    expect([...bucketed].sort()).toEqual([...BRIDGE_TOLERANCE_CLASSES].sort());
  });
});

describe('findFirstDivergenceIndex', () => {
  test('identical strings return -1', () => {
    expect(findFirstDivergenceIndex('hello', 'hello')).toBe(-1);
  });

  test('first char differs returns 0', () => {
    expect(findFirstDivergenceIndex('abc', 'xyz')).toBe(0);
  });

  test('middle char differs', () => {
    expect(findFirstDivergenceIndex('abcdef', 'abcXef')).toBe(3);
  });

  test('length difference at end', () => {
    expect(findFirstDivergenceIndex('abc', 'abcdef')).toBe(3);
  });

  test('empty vs non-empty', () => {
    expect(findFirstDivergenceIndex('', 'a')).toBe(0);
  });

  test('both empty returns -1', () => {
    expect(findFirstDivergenceIndex('', '')).toBe(-1);
  });
});

describe('emitToleranceFire', () => {
  test('does nothing when no hook is set', () => {
    emitToleranceFire(['crlf'], 'a\r\n', 'a\n', 'test-doc');
  });

  test('fires hook once per class', () => {
    const records: ToleranceFireRecord[] = [];
    setToleranceTelemetryHook((r) => records.push(r));

    emitToleranceFire(['bom', 'crlf'], '﻿a\r\n', 'a\n', 'my-doc');

    expect(records).toHaveLength(2);
    expect(records[0]?.className).toBe('bom');
    expect(records[1]?.className).toBe('crlf');
  });

  test('record has all required fields', () => {
    const records: ToleranceFireRecord[] = [];
    setToleranceTelemetryHook((r) => records.push(r));

    emitToleranceFire(['trailing-newline'], 'hello\n', 'hello', 'notes/foo');

    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r).toBeDefined();
    expect(r?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r?.className).toBe('trailing-newline');
    expect(r?.documentName).toBe('notes/foo');
    expect(r?.codeUnitPosition).toBe(5);
    expect(r?.severity).toBe('serializer-caused');
  });

  test('empty classes array does not fire hook', () => {
    let called = false;
    setToleranceTelemetryHook(() => {
      called = true;
    });

    emitToleranceFire([], 'same', 'same', 'doc');

    expect(called).toBe(false);
  });

  test('undefined documentName passes through', () => {
    const records: ToleranceFireRecord[] = [];
    setToleranceTelemetryHook((r) => records.push(r));

    emitToleranceFire(['crlf'], 'a\r', 'a', undefined);

    expect(records[0]?.documentName).toBeUndefined();
  });

  test('clearing hook stops emissions', () => {
    const records: ToleranceFireRecord[] = [];
    setToleranceTelemetryHook((r) => records.push(r));
    emitToleranceFire(['crlf'], 'a\r', 'a', 'doc');
    expect(records).toHaveLength(1);

    setToleranceTelemetryHook(null);
    emitToleranceFire(['crlf'], 'a\r', 'a', 'doc');
    expect(records).toHaveLength(1);
  });
});
