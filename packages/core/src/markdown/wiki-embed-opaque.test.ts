import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';
import { assertByteStable } from './round-trip-asserts.test-helper.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function roundTrip(md: string): string {
  return mdManager.serialize(mdManager.parse(md));
}

const expectByteStable = (md: string): void => assertByteStable(roundTrip, md);

function findNodes(json: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === type) out.push(n);
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

describe('opaque-extension wiki-embed — byte-exact PM round-trip', () => {
  test('block-context opaque embed round-trips byte-identical', () => {
    expectByteStable('![[notes.foo]]\n');
  });

  test('inline mid-prose opaque embed round-trips byte-identical', () => {
    expectByteStable('see ![[notes.foo]] here\n');
  });

  test('extension-less embed round-trips byte-identical', () => {
    expectByteStable('![[plainname]]\n');
  });

  test('serveable-but-not-inline-renderable extension round-trips byte-identical', () => {
    expectByteStable('![[diagram.avi]]\n');
  });

  test('opaque embed with alias round-trips byte-identical', () => {
    expectByteStable('![[notes.foo|My Alias]]\n');
  });

  test('opaque embed with anchor round-trips byte-identical', () => {
    expectByteStable('![[notes.foo#section]]\n');
  });

  test('opaque embed with anchor and alias round-trips byte-identical', () => {
    expectByteStable('![[notes.foo#section|Custom]]\n');
  });

  test('opaque embed coexisting with wikiLink and allowlisted embed round-trips', () => {
    expectByteStable('See [[Index]], ![[diagram.png]] and ![[archive.xyz]] together.\n');
  });
});

describe('opaque-extension wiki-embed — WYSIWYG label edit is honored, never reverted', () => {
  function editEmbedLabel(json: JSONContent, newText: string): JSONContent {
    let edited = 0;
    const visit = (n: JSONContent) => {
      if (
        n.type === 'text' &&
        n.marks?.some((m) => m.type === 'link' && m.attrs?.sourceForm === 'wikiembed')
      ) {
        n.text = newText;
        edited++;
      }
      for (const child of n.content ?? []) visit(child);
    };
    visit(json);
    expect(edited).toBe(1);
    return json;
  }

  test('editing an aliased embed label replaces the alias', () => {
    const json = editEmbedLabel(mdManager.parse('![[notes.foo|My Label]]\n'), 'Edited Label');
    expect(mdManager.serialize(json)).toBe('![[notes.foo|Edited Label]]\n');
  });

  test('editing an alias-less embed label adds an alias (target preserved)', () => {
    const json = editEmbedLabel(mdManager.parse('![[notes.foo]]\n'), 'My New Text');
    expect(mdManager.serialize(json)).toBe('![[notes.foo|My New Text]]\n');
  });

  test('editing an anchored embed label adds an alias (target#anchor preserved)', () => {
    const json = editEmbedLabel(mdManager.parse('![[notes.foo#section]]\n'), 'Renamed');
    expect(mdManager.serialize(json)).toBe('![[notes.foo#section|Renamed]]\n');
  });

  test('the edited form is byte-stable on subsequent round-trips', () => {
    const json = editEmbedLabel(mdManager.parse('![[notes.foo|My Label]]\n'), 'Edited Label');
    const once = mdManager.serialize(json);
    expect(roundTrip(once)).toBe(once);
  });

  test('an unedited label still round-trips byte-identical through the attrs path', () => {
    const json = mdManager.parse('![[notes.foo|My Label]]\n');
    expect(mdManager.serialize(json)).toBe('![[notes.foo|My Label]]\n');
  });

  test('a whitespace-only label edit does not produce an empty alias', () => {
    const json = editEmbedLabel(mdManager.parse('![[notes.foo|My Label]]\n'), '   ');
    expect(mdManager.serialize(json)).toBe('![[notes.foo|My Label]]\n');
  });

  test('a label edit containing `]]` keeps the attrs label — the closing delimiter is unrepresentable in the alias slot', () => {
    const json = editEmbedLabel(mdManager.parse('![[notes.foo|My Label]]\n'), 'My ]] Label');
    const once = mdManager.serialize(json);
    expect(once).toBe('![[notes.foo|My Label]]\n');
    expect(roundTrip(once)).toBe(once);
  });
});

describe('opaque-extension wiki-embed — PM shape contract', () => {
  test('opaque embed lands on text+link-mark tagged wikiembed, never a PM wikiLinkEmbed node', () => {
    const json = mdManager.parse('![[notes.foo]]\n');
    expect(findNodes(json, 'wikiLinkEmbed')).toHaveLength(0);
    const texts = findNodes(json, 'text');
    expect(texts).toHaveLength(1);
    const linkMark = texts[0]?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark?.attrs?.sourceForm).toBe('wikiembed');
    expect(linkMark?.attrs?.target).toBe('notes.foo');
    expect(linkMark?.attrs?.anchor).toBeNull();
    expect(linkMark?.attrs?.alias).toBeNull();
  });

  test('alias and anchor are carried on the mark, label shows the alias', () => {
    const json = mdManager.parse('![[notes.foo#sec|My Alias]]\n');
    const texts = findNodes(json, 'text');
    expect(texts[0]?.text).toBe('My Alias');
    const linkMark = texts[0]?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark?.attrs?.target).toBe('notes.foo');
    expect(linkMark?.attrs?.anchor).toBe('sec');
    expect(linkMark?.attrs?.alias).toBe('My Alias');
  });

  test('resolver-remapped href does not perturb the byte round-trip', () => {
    const json = mdManager.parse('![[notes.foo]]\n', {
      resolveEmbed: (target) => (target === 'notes.foo' ? 'attachments/notes.foo' : null),
      sourcePath: 'docs/meeting.md',
    });
    const texts = findNodes(json, 'text');
    const linkMark = texts[0]?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark?.attrs?.href).toBe('/attachments/notes.foo');
    expect(linkMark?.attrs?.target).toBe('notes.foo');
    expect(mdManager.serialize(json)).toBe('![[notes.foo]]\n');
  });
});

describe('opaque-extension widening — no regression on neighbors', () => {
  test('plain markdown link keeps a null sourceForm and round-trips unchanged', () => {
    const json = mdManager.parse('[label](dest.foo)\n');
    const texts = findNodes(json, 'text');
    const linkMark = texts[0]?.marks?.find((mk) => mk.type === 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark?.attrs?.sourceForm).toBeNull();
    expect(mdManager.serialize(json)).toBe('[label](dest.foo)\n');
  });

  test('allowlisted block-context embed still promotes to jsxComponent and round-trips', () => {
    const json = mdManager.parse('![[photo.png]]\n');
    const node = json.content?.[0];
    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs?.componentName).toBe('WikiEmbedImage');
    expect(mdManager.serialize(json)).toBe('![[photo.png]]\n');
  });

  test('allowlisted inline embed keeps the wikiembed chip and round-trips', () => {
    expectByteStable('text ![[photo.png]] more text\n');
  });

  test('wikiLink sibling is untouched', () => {
    expectByteStable('[[Page]]\n');
  });
});
