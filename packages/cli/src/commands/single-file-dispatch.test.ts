import { describe, expect, test } from 'bun:test';
import {
  decideSingleFileTarget,
  hasMarkdownExtension,
  scanRootArgv,
} from './single-file-dispatch.ts';

const SUBCOMMANDS = new Set([
  'start',
  'init',
  'mcp',
  'ui',
  'open',
  'ps',
  'status',
  'stop',
  'clean',
]);

function isFileishWith(existing: Set<string>): (t: string) => boolean {
  return (t) => hasMarkdownExtension(t) || existing.has(t);
}

describe('scanRootArgv', () => {
  test('collects positional operands, strips global options', () => {
    expect(scanRootArgv(['notes.md']).operands).toEqual(['notes.md']);
    expect(scanRootArgv(['--no-color', 'notes.md']).operands).toEqual(['notes.md']);
    expect(scanRootArgv(['--log-level', 'debug', 'notes.md']).operands).toEqual(['notes.md']);
    expect(scanRootArgv(['--log-level=debug', 'notes.md']).operands).toEqual(['notes.md']);
    expect(scanRootArgv(['open', 'doc']).operands).toEqual(['open', 'doc']);
  });

  test('extracts --cwd (space + equals form), consuming its value', () => {
    expect(scanRootArgv(['--cwd', '/foo', 'notes.md']).cwd).toBe('/foo');
    expect(scanRootArgv(['--cwd=/bar', 'notes.md']).cwd).toBe('/bar');
    expect(scanRootArgv(['--cwd', '/foo', 'notes.md']).operands).toEqual(['notes.md']);
  });

  test('help/version flags short-circuit to terminal (passthrough to Commander)', () => {
    expect(scanRootArgv(['--help']).sawTerminalFlag).toBe(true);
    expect(scanRootArgv(['-h']).sawTerminalFlag).toBe(true);
    expect(scanRootArgv(['--version']).sawTerminalFlag).toBe(true);
    expect(scanRootArgv(['-V']).sawTerminalFlag).toBe(true);
    expect(scanRootArgv(['notes.md']).sawTerminalFlag).toBe(false);
  });
});

describe('decideSingleFileTarget', () => {
  const opts = (existing: string[] = []) => ({
    knownSubcommands: SUBCOMMANDS,
    isFileish: isFileishWith(new Set(existing)),
  });

  test('a .md / .mdx operand routes to single-file open', () => {
    expect(decideSingleFileTarget(['notes.md'], opts())).toBe('notes.md');
    expect(decideSingleFileTarget(['./a/b.mdx'], opts())).toBe('./a/b.mdx');
  });

  test('an existing file (no markdown ext) routes to single-file open', () => {
    expect(decideSingleFileTarget(['README'], opts(['README']))).toBe('README');
  });

  test('a known subcommand is left for Commander (passthrough)', () => {
    expect(decideSingleFileTarget(['start'], opts())).toBeNull();
    expect(decideSingleFileTarget(['init'], opts())).toBeNull();
    expect(decideSingleFileTarget(['start'], opts(['start']))).toBeNull();
  });

  test('`ok open <file>` (fileish 2nd operand) routes to single-file open of that file', () => {
    expect(decideSingleFileTarget(['open', 'notes.md'], opts())).toBe('notes.md');
    expect(decideSingleFileTarget(['open', './start'], opts(['./start']))).toBe('./start');
  });

  test('`ok open <ext-less doc>` is left to the existing `ok open` subcommand', () => {
    expect(decideSingleFileTarget(['open', 'specs/foo/SPEC'], opts())).toBeNull();
  });

  test('no operand → passthrough', () => {
    expect(decideSingleFileTarget([], opts())).toBeNull();
  });

  test('a non-fileish first operand → passthrough (Commander reports unknown command)', () => {
    expect(decideSingleFileTarget(['totally-unknown'], opts())).toBeNull();
  });
});

describe('hasMarkdownExtension', () => {
  test('matches .md / .mdx case-insensitively only at the end', () => {
    expect(hasMarkdownExtension('notes.md')).toBe(true);
    expect(hasMarkdownExtension('notes.MDX')).toBe(true);
    expect(hasMarkdownExtension('notes.markdown')).toBe(false);
    expect(hasMarkdownExtension('md')).toBe(false);
    expect(hasMarkdownExtension('a.md.txt')).toBe(false);
  });
});
