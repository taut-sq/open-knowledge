import { afterEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  agentPatch,
  agentWriteMd,
  createTestClients,
  createTestServer,
  pollUntil,
  readTestDoc,
  type TestClient,
  type TestServer,
} from './test-harness.ts';

let server: TestServer | undefined;

afterEach(async () => {
  if (server) {
    await server.cleanup();
    server = undefined;
  }
});

async function frontmatterPatch(port: number, docName: string, patch: Record<string, unknown>) {
  return fetch(`http://127.0.0.1:${port}/api/frontmatter-patch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docName, patch }),
  });
}

async function renamePath(port: number, fromPath: string, toPath: string) {
  return fetch(`http://127.0.0.1:${port}/api/rename-path`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'file', fromPath, toPath }),
  });
}

describe('PRD-6832 β L1: agent write reconciles a newer out-of-band disk edit', () => {
  test('write_document append: the native edit is NOT clobbered + FR3 warning fires', async () => {
    server = await createTestServer({ debounce: 50, maxDebounce: 200 });
    const { port, contentDir } = server;
    const docName = `reconcile-append-${randomUUID()}`;
    const filePath = join(contentDir, `${docName}.md`);

    await agentWriteMd(port, '# V1 from agent\n\nbody-v1\n', { docName, position: 'replace' });
    await pollUntil(() => readTestDoc(contentDir, docName).includes('body-v1'));

    writeFileSync(filePath, '# V2 NATIVE OUT-OF-BAND EDIT\n\nbody-v2-native\n', 'utf-8');

    const res = await fetch(`http://127.0.0.1:${port}/api/agent-write-md`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docName,
        markdown: 'appended-by-agent-still-on-v1\n',
        position: 'append',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      warning?: { kind?: string };
      warnings?: Array<{ kind?: string }>;
    };
    expect(body.warning?.kind).toBe('disk-edit-reconciled');
    expect(body.warnings?.map((w) => w.kind)).toEqual(['disk-edit-reconciled']);

    const after = readTestDoc(contentDir, docName);
    expect(after).toContain('body-v2-native'); // out-of-band edit preserved (no clobber)
    expect(after).toContain('appended-by-agent-still-on-v1'); // agent edit applied on top
  });

  test('edit_document find/replace: runs against the live (disk-reflecting) content', async () => {
    server = await createTestServer({ debounce: 50, maxDebounce: 200 });
    const { port, contentDir } = server;
    const docName = `reconcile-patch-${randomUUID()}`;
    const filePath = join(contentDir, `${docName}.md`);

    await agentWriteMd(port, '# Doc\n\nBANANA here\n', { docName, position: 'replace' });
    await pollUntil(() => readTestDoc(contentDir, docName).includes('BANANA'));

    writeFileSync(filePath, '# Doc\n\nBANANA here\n\nnative-extra-line\n', 'utf-8');

    await agentPatch(port, 'BANANA', 'CHERRY', docName);

    const after = readTestDoc(contentDir, docName);
    expect(after).toContain('CHERRY'); // patch applied against the reconciled content
    expect(after).not.toContain('BANANA'); // the find target was replaced
    expect(after).toContain('native-extra-line'); // out-of-band edit preserved
  });

  test('edit_frontmatter: the native body edit is preserved while the FM patch applies', async () => {
    server = await createTestServer({ debounce: 50, maxDebounce: 200 });
    const { port, contentDir } = server;
    const docName = `reconcile-fm-${randomUUID()}`;
    const filePath = join(contentDir, `${docName}.md`);

    await agentWriteMd(port, '# Doc\n\nbody-original\n', { docName, position: 'replace' });
    await pollUntil(() => readTestDoc(contentDir, docName).includes('body-original'));

    writeFileSync(filePath, '# Doc\n\nbody-original\n\nnative-body-line\n', 'utf-8');

    const res = await frontmatterPatch(port, docName, { title: 'New Title' });
    expect(res.status).toBe(200);

    const after = readTestDoc(contentDir, docName);
    expect(after).toContain('New Title'); // FM patch applied
    expect(after).toContain('native-body-line'); // out-of-band body edit preserved
  });

  test('concurrent un-flushed CRDT edit: the L1 wholesale ingest drops it (current behavior, recorded honestly)', async () => {
    server = await createTestServer({ debounce: 300_000, maxDebounce: 600_000 });
    const { port, contentDir } = server;
    const docName = `reconcile-concurrent-${randomUUID()}`;
    const filePath = join(contentDir, `${docName}.md`);

    writeFileSync(filePath, '# Doc\n\nseed-body\n', 'utf-8');

    let clients: TestClient[] = [];
    try {
      clients = await createTestClients(port, { count: 1, docName });
      const client = clients[0];
      if (!client) throw new Error('client setup failed');
      await pollUntil(() => client.ytext.toString().includes('seed-body'));

      client.doc.transact(() => {
        client.ytext.insert(client.ytext.length, '\ncrdt-unflushed-line\n');
      });
      const serverYtext = () =>
        server?.instance.hocuspocus.documents.get(docName)?.getText('source').toString() ?? '';
      await pollUntil(() => serverYtext().includes('crdt-unflushed-line'));
      expect(readTestDoc(contentDir, docName)).not.toContain('crdt-unflushed-line');

      writeFileSync(filePath, '# Doc\n\nseed-body\n\ndisk-oob-line\n', 'utf-8');

      const res = await fetch(`http://127.0.0.1:${port}/api/agent-write-md`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docName, markdown: 'agent-line\n', position: 'append' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { warning?: { kind?: string } };
      expect(body.warning?.kind).toBe('disk-edit-reconciled');

      await pollUntil(() => serverYtext().includes('agent-line'));
      expect(serverYtext()).toContain('disk-oob-line');

      expect(serverYtext()).not.toContain('crdt-unflushed-line');
    } finally {
      for (const c of clients) {
        await c.cleanup();
      }
    }
  });

  test('rename: the renamed doc carries the newer out-of-band disk content', async () => {
    server = await createTestServer({ debounce: 50, maxDebounce: 200 });
    const { port, contentDir } = server;
    const fromDoc = `reconcile-rename-from-${randomUUID()}`;
    const toDoc = `reconcile-rename-to-${randomUUID()}`;
    const fromPath = join(contentDir, `${fromDoc}.md`);

    await agentWriteMd(port, '# V1\n\nbody-v1\n', { docName: fromDoc, position: 'replace' });
    await pollUntil(() => readTestDoc(contentDir, fromDoc).includes('body-v1'));

    writeFileSync(fromPath, '# V2 NATIVE OUT-OF-BAND EDIT\n\nbody-v2-native\n', 'utf-8');

    const res = await renamePath(port, `${fromDoc}.md`, `${toDoc}.md`);
    expect(res.status).toBe(200);

    const after = readTestDoc(contentDir, toDoc);
    expect(after).toContain('body-v2-native'); // the newer disk edit moved with the rename
  });
});
