
import { describe, expect, test } from 'bun:test';
import SRC from './sidebar?raw';

describe('getInitialSidebarWidth source-level guards', () => {
  test('decodeURIComponent is wrapped in a try/catch that returns defaultWidth', () => {
    const start = SRC.indexOf('function getInitialSidebarWidth');
    expect(start).toBeGreaterThan(-1);
    const after = SRC.slice(start);
    const end = after.indexOf('\nfunction ', 1);
    const body = end === -1 ? after : after.slice(0, end);

    expect(body).toContain('decodeURIComponent(savedWidth)');
    expect(body).toMatch(/try\s*{[\s\S]*decodeURIComponent[\s\S]*}\s*catch/);
    expect(body).toMatch(/catch\s*(?:\([^)]*\))?\s*{[\s\S]*return defaultWidth/);
  });

  test('decoded value is range-checked against SIDEBAR_WIDTH_VALUE_PATTERN', () => {
    expect(SRC).toContain('const SIDEBAR_WIDTH_VALUE_PATTERN = /^\\d+(?:\\.\\d+)?(?:rem|px)$/');
    expect(SRC).toMatch(/SIDEBAR_WIDTH_VALUE_PATTERN\.test\(decodedWidth\)/);
  });
});

describe('SIDEBAR_ID anchors aria-controls referent', () => {
  test('id={SIDEBAR_ID} is set on the sidebar-container nav', () => {
    const matches = SRC.match(/id=\{SIDEBAR_ID\}/g);
    expect(matches?.length).toBe(1);
  });

  test('nav carrying id={SIDEBAR_ID} also carries aria-label="File sidebar"', () => {
    const ariaLabels = SRC.match(/aria-label=\{t`File sidebar`\}/g);
    expect(ariaLabels?.length).toBe(1);
  });
});

describe('Sidebar motion duration is appropriate for toggle frequency', () => {
  test('sidebar-gap width collapse uses duration-200 ease-linear', () => {
    expect(SRC).toContain(
      'data-slot="sidebar-gap"\n        className={cn(\n          \'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
    );
  });

  test('sidebar-container layout uses duration-200 ease-linear with reduced-motion gating', () => {
    expect(SRC).toContain(
      'transition-[left,right,width] duration-200 ease-linear motion-reduce:transition-none',
    );
  });

  test('SidebarGroupLabel collapse uses duration-200 ease-linear', () => {
    expect(SRC).toContain('transition-[margin,opacity] duration-200 ease-linear');
  });
});
