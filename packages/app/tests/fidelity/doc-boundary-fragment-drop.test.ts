import { describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

describe('sourceDocBoundary never survives the Y.XmlFragment path', () => {
  test('a captured boundary snapshot resets to the schema default through the fragment round-trip', () => {
    const json = mdManager.parse('\u{FEFF}\n\nHello\n\n\nWorld\n');
    expect(json.attrs?.sourceDocBoundary ?? null).not.toBeNull();

    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment('default');
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(doc, fragment, schema.nodeFromJSON(json), meta);

    const back = yXmlFragmentToProseMirrorRootNode(fragment, schema).toJSON();
    expect(back.attrs?.sourceDocBoundary ?? null).toBeNull();
    expect(mdManager.serialize(back)).toBe('Hello\n\nWorld\n');
    doc.destroy();
  });
});
