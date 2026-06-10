import { existsSync, readFileSync } from 'node:fs';
import { renderInventoryFooter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import { mergePatch } from '../../content/frontmatter-merge.ts';
import type { TemplateFrontmatter } from '../../content/templates-write.ts';
import { SUPPORTED_DOC_EXTENSIONS } from '../../doc-extensions.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { formatContentDivergenceLine, parseContentDivergence } from './content-divergence.ts';
import { resolveWithinRoot } from './path-safety.ts';
import { buildPreviewAttachWarning, resolvePreviewUrl, START_UI_TEXT_HINT } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  agentIdentityFields,
  documentResultBaseShape,
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  httpPut,
  nestDocResult,
  normalizeDocName,
  outputSchemaWithText,
  previewAttachWarningField,
  previewUrlOutputField,
  previewUrlSourceField,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  summaryArgSchema,
  textPlusStructured,
  textResult,
} from './shared.ts';
import {
  exactlyOneTargetError,
  FrontmatterArg,
  resolveTemplatePath,
  TEMPLATE_PATH_DESCRIBE,
} from './verb-schemas.ts';

type FrontmatterPatch = Record<string, string | number | boolean | string[] | null>;

const BASE_DESCRIPTION = [
  'Edit one thing in place. Pass EXACTLY ONE of `document`, `folder`, or `template`. Within each: a body edit (`find` + `replace`) OR a `frontmatter` merge-patch — not both in one call.',
  '',
  '- `document` — Edit a doc [Requires: Hocuspocus server]. Body: `{ path, find, replace, occurrence? }` (occurrence = which match, 1 = first). Metadata: `{ path, frontmatter }` (merge-patch; `null` deletes a key). Body find/replace is body-only; frontmatter-intersecting finds are rejected.',
  '- `folder` — Edit a folder (folders have no body): `{ path, frontmatter }` (merge-patch).',
  '- `template` — Edit a template: `{ path: "<folder>/<name>", ... }`; body `find`/`replace`/`occurrence?` or metadata `frontmatter`.',
  '- `summary` — Optional one-line user-outcome (≤80 chars) recorded in the timeline for any `document`, `folder`, or `template` edit. Avoid secrets or PII — persisted to git history.',
  '',
  'Responses may include `structuredContent.document.contentDivergence` when the converged Y.Text doesn\'t match the bytes your edit composed to. The edit still landed; re-read the doc with `exec("cat <path>")` to see what converged.',
].join('\n');

export const DESCRIPTION = `${BASE_DESCRIPTION}\n${renderInventoryFooter()}`;

interface EditDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
}

interface BodyEdit {
  find?: string;
  replace?: string;
  occurrence?: number;
}

function bodyOrFrontmatterError(
  t: BodyEdit & { frontmatter?: FrontmatterPatch },
  label: string,
): string | null {
  const hasBody = t.find !== undefined || t.replace !== undefined;
  const hasFm = t.frontmatter !== undefined;
  if (t.find !== undefined && t.replace === undefined) {
    return `\`find\` needs a \`replace\`. Body edit: { ${label}: { …, find, replace } }.`;
  }
  if (t.replace !== undefined && t.find === undefined) {
    return `\`replace\` needs a \`find\`. Body edit: { ${label}: { …, find, replace } }.`;
  }
  if (hasBody && hasFm) {
    return `Pick ONE: edit body text (find+replace) OR metadata (frontmatter), not both in one call.`;
  }
  if (!hasBody && !hasFm) {
    return `Provide either a body edit (find+replace) or a frontmatter patch for { ${label} }.`;
  }
  return null;
}

function readDocFullText(contentDir: string, docName: string): string | null {
  for (const ext of SUPPORTED_DOC_EXTENSIONS) {
    const contained = resolveWithinRoot(contentDir, `${docName}${ext}`);
    if (contained.ok && existsSync(contained.abs)) {
      try {
        return readFileSync(contained.abs, 'utf-8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw err;
      }
    }
  }
  return null;
}

function nthOccurrenceOffset(text: string, find: string, occurrence: number): number {
  let from = 0;
  for (let i = 0; i < occurrence; i++) {
    const idx = text.indexOf(find, from);
    if (idx === -1) return -1;
    if (i === occurrence - 1) return idx;
    from = idx + Math.max(1, find.length);
  }
  return -1;
}


async function handleDocBody(
  doc: { path: string; find?: string; replace?: string; occurrence?: number },
  args: { summary?: string },
  cwd: string,
  contentDir: string,
  url: string,
  deps: EditDeps,
  autoOpen: boolean,
) {
  const normalized = normalizeDocName(doc.path);
  if (!normalized.ok) return textResult(normalized.error, true);
  const identity = deps.identityRef?.current;

  let offset: number | undefined;
  const occurrence = doc.occurrence ?? 1;
  if (occurrence > 1) {
    let full: string | null;
    try {
      full = readDocFullText(contentDir, normalized.docName);
    } catch (err) {
      return textResult(
        `Error: cannot read "${normalized.docName}" to resolve occurrence ${occurrence}: ${err instanceof Error ? err.message : String(err)}.`,
        true,
      );
    }
    if (full === null) {
      return textResult(
        `Error: cannot resolve occurrence ${occurrence} — "${normalized.docName}" is not on disk yet. Retry with the first match (omit \`occurrence\`).`,
        true,
      );
    }
    const idx = nthOccurrenceOffset(full, doc.find as string, occurrence);
    if (idx === -1) {
      return textResult(
        `Error: \`find\` occurs fewer than ${occurrence} times in "${normalized.docName}".`,
        true,
      );
    }
    offset = idx;
  }

  const result = await httpPost(url, '/api/agent-patch', {
    docName: normalized.docName,
    find: doc.find,
    replace: doc.replace,
    ...(offset !== undefined ? { offset } : {}),
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...agentIdentityFields(identity),
  });
  if (!result.ok) {
    const detail =
      typeof result.detail === 'string' && result.detail.length > 0 ? result.detail : '';
    return textResult(
      detail ? `Error: ${result.error} (${detail})` : `Error: ${result.error}`,
      true,
    );
  }
  return composeWritePreviewResult(
    result,
    normalized.docName,
    cwd,
    autoOpen,
    'Edit applied successfully.',
  );
}

async function handleDocFrontmatter(
  doc: { path: string; frontmatter: FrontmatterPatch },
  args: { summary?: string },
  cwd: string,
  url: string,
  deps: EditDeps,
  autoOpen: boolean,
) {
  const normalized = normalizeDocName(doc.path);
  if (!normalized.ok) return textResult(normalized.error, true);
  const identity = deps.identityRef?.current;
  const result = await httpPost(url, '/api/frontmatter-patch', {
    docName: normalized.docName,
    patch: doc.frontmatter,
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...agentIdentityFields(identity),
  });
  if (!result.ok) {
    const errorText = result.error as string;
    const fieldErrors =
      result.fieldErrors && typeof result.fieldErrors === 'object'
        ? (result.fieldErrors as Record<string, string>)
        : undefined;
    if (fieldErrors) {
      const lines = Object.entries(fieldErrors).map(([k, m]) => `  ${k}: ${m}`);
      return textResult(`Error: ${errorText}\n${lines.join('\n')}`, true);
    }
    return textResult(`Error: ${errorText}`, true);
  }
  const setKeys: string[] = [];
  const deleteKeys: string[] = [];
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    if (value === null) deleteKeys.push(key);
    else setKeys.push(key);
  }
  const opSummary = [
    setKeys.length ? `${setKeys.length} set` : '',
    deleteKeys.length ? `${deleteKeys.length} deleted` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return composeWritePreviewResult(
    result,
    normalized.docName,
    cwd,
    autoOpen,
    `Frontmatter patched (${opSummary || `${Object.keys(doc.frontmatter).length} key(s)`}).`,
  );
}

function composeWritePreviewResult(
  result: Awaited<ReturnType<typeof httpPost>>,
  docName: string,
  cwd: string,
  autoOpen: boolean,
  leadLine: string,
) {
  const lockDir = resolveLockDir(cwd);
  const preview = resolvePreviewUrl(docName, { lockDir });
  const subscriberCount =
    typeof result.subscriberCount === 'number' ? result.subscriberCount : undefined;
  const systemSubscriberCount =
    typeof result.systemSubscriberCount === 'number' ? result.systemSubscriberCount : undefined;
  const noPreviewAnywhere = systemSubscriberCount === 0;
  const noPreviewOnThisDoc = subscriberCount === 0;
  const summaryResult =
    result.summary && typeof result.summary === 'object'
      ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
      : undefined;
  const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;
  const contentDivergence = parseContentDivergence(result.warning);

  const lines: string[] = [leadLine];
  if (noPreviewAnywhere && !preview) lines.push(START_UI_TEXT_HINT);
  if (summaryHint) lines.push(summaryHint);
  if (contentDivergence) {
    lines.push(formatContentDivergenceLine(contentDivergence));
  }
  const text = lines.join('\n');
  if (
    !preview &&
    !noPreviewAnywhere &&
    !noPreviewOnThisDoc &&
    !summaryResult &&
    !contentDivergence
  ) {
    return textResult(text);
  }
  const document: Record<string, unknown> = {};
  if (summaryResult) document.summary = summaryResult;
  if (contentDivergence) document.contentDivergence = contentDivergence;
  const warning = noPreviewAnywhere ? buildPreviewAttachWarning(preview, autoOpen) : undefined;
  return textPlusStructured(text, nestDocResult(preview, warning, document));
}


function templateFilePath(
  cwd: string,
  folder: string,
  name: string,
): { ok: true; abs: string } | { ok: false } {
  const contained = resolveWithinRoot(
    cwd,
    `${folder.replace(/\/+$/, '')}/.ok/templates/${name}.md`,
  );
  return contained.ok ? { ok: true, abs: contained.abs } : { ok: false };
}

function parseTemplateFrontmatter(raw: string): TemplateFrontmatter {
  const inner = raw
    .replace(/^---\r?\n/, '')
    .replace(/\r?\n?---\r?\n?$/, '')
    .trim();
  if (inner === '') return { title: '' };
  const parsed: unknown = parseYaml(inner);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return { title: '' };
  const obj = parsed as Record<string, unknown>;
  return {
    title: typeof obj.title === 'string' ? obj.title : '',
    ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
    ...(Array.isArray(obj.tags) ? { tags: obj.tags.map((t) => String(t)) } : {}),
  };
}

async function handleTemplate(
  template: {
    path: string;
    find?: string;
    replace?: string;
    occurrence?: number;
    frontmatter?: FrontmatterPatch;
  },
  summary: string | undefined,
  cwd: string,
  url: string | undefined,
  deps: EditDeps,
) {
  const teaching = bodyOrFrontmatterError(template, 'template');
  if (teaching) return textResult(`Error: ${teaching}`, true);

  const resolved = resolveTemplatePath(template.path);
  if (!resolved.ok) return textResult(`Error: ${resolved.error}`, true);
  const { folder, name } = resolved;

  if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
  const filePath = templateFilePath(cwd, folder, name);
  if (!filePath.ok || !existsSync(filePath.abs)) {
    return textResult(
      `Error: template "${name}" not found in ${folder || '(root)'}. Create it with \`write({ template })\` first.`,
      true,
    );
  }
  let raw: string;
  try {
    raw = readFileSync(filePath.abs, 'utf-8');
  } catch (err) {
    return textResult(`Error: could not read template: ${(err as Error).message}`, true);
  }
  const { frontmatter: fmRaw, body } = stripFrontmatter(raw);
  const existingFm = parseTemplateFrontmatter(fmRaw);

  if (template.frontmatter !== undefined) {
    const merged = mergePatch(
      existingFm as Record<string, unknown>,
      template.frontmatter as Record<string, unknown>,
    ) as TemplateFrontmatter;
    const result = await httpPut(url, '/api/template', {
      folder,
      name,
      body,
      frontmatter: merged,
      ...(summary !== undefined ? { summary } : {}),
      ...agentIdentityFields(deps.identityRef?.current),
    });
    if (!result.ok) return textResult(`Error: ${result.error}`, true);
    const path = typeof result.path === 'string' ? result.path : undefined;
    return textPlusStructured(
      `Patched template "${name}" frontmatter${path ? ` (${path})` : ''}.`,
      {
        template: { ok: true, path },
      },
    );
  }

  const occurrence = template.occurrence ?? 1;
  const idx = nthOccurrenceOffset(body, template.find as string, occurrence);
  if (idx === -1) {
    return textResult(
      `Error: \`find\` occurs fewer than ${occurrence} time(s) in template "${name}".`,
      true,
    );
  }
  const newBody =
    body.slice(0, idx) +
    (template.replace as string) +
    body.slice(idx + (template.find as string).length);
  const result = await httpPut(url, '/api/template', {
    folder,
    name,
    body: newBody,
    frontmatter: existingFm,
    ...(summary !== undefined ? { summary } : {}),
    ...agentIdentityFields(deps.identityRef?.current),
  });
  if (!result.ok) return textResult(`Error: ${result.error}`, true);
  const path = typeof result.path === 'string' ? result.path : undefined;
  return textPlusStructured(`Edited template "${name}"${path ? ` (${path})` : ''}.`, {
    template: { ok: true, path },
  });
}


async function handleFolder(
  folder: { path: string; frontmatter: FrontmatterPatch },
  summary: string | undefined,
  url: string | undefined,
  deps: EditDeps,
) {
  if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
  const result = await httpPut(url, '/api/folder-config', {
    path: folder.path,
    frontmatter: folder.frontmatter,
    ...(summary !== undefined ? { summary } : {}),
    ...agentIdentityFields(deps.identityRef?.current),
  });
  if (!result.ok) return textResult(`Error: ${result.error}`, true);
  const applied = Array.isArray(result.applied) ? result.applied : [];
  const entry = (applied[0] ?? {}) as { path?: string; action?: string };
  const action = entry.action ?? 'written';
  const verb = action === 'deleted' ? 'Cleared' : action === 'noop' ? 'No change to' : 'Updated';
  return textPlusStructured(`${verb} folder properties for ${folder.path}.`, {
    folder: { ok: true, path: entry.path ?? `${folder.path}/.ok/frontmatter.yml`, action },
  });
}


export function register(server: ServerInstance, deps: EditDeps): void {
  const bodyFields = {
    find: z
      .string()
      .optional()
      .describe(
        'Exact BODY text to find. Use WITH `replace`. For metadata, use `frontmatter` instead — not this.',
      ),
    replace: z.string().optional().describe('Replacement for the `find` match.'),
    occurrence: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Which match to edit (1 = first). Default: first.'),
  };

  server.registerTool(
    'edit',
    {
      description: DESCRIPTION,
      inputSchema: {
        document: z
          .object({
            path: z
              .string()
              .describe(
                'Document path, no extension — the slashes are its folder. Example: "meetings/standup".',
              ),
            ...bodyFields,
            frontmatter: FrontmatterArg.optional().describe(
              'Metadata merge-patch (set keys; `null` deletes a key). Use INSTEAD of find/replace.',
            ),
          })
          .optional()
          .describe(
            'Edit a DOCUMENT: its body (find+replace) OR its frontmatter (patch). Body: { document: { path, find, replace } }. Metadata: { document: { path, frontmatter } }.',
          ),
        folder: z
          .object({
            path: z.string().describe('Folder path.'),
            frontmatter: FrontmatterArg.describe(
              "Update the folder's own title/description/tags (merge-patch; `null` deletes).",
            ),
          })
          .optional()
          .describe(
            'Edit a FOLDER: only its frontmatter (folders have no body). Example: { folder: { path: "meetings", frontmatter: { description: "All-hands" } } }',
          ),
        template: z
          .object({
            path: z.string().describe(TEMPLATE_PATH_DESCRIBE),
            ...bodyFields,
            frontmatter: FrontmatterArg.optional().describe('Template metadata merge-patch.'),
          })
          .optional()
          .describe('Edit a TEMPLATE: body (find+replace) or frontmatter (patch).'),
        summary: summaryArgSchema,
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: outputSchemaWithText({
        document: z
          .object(documentResultBaseShape)
          .optional()
          .describe('Document edit result (present when there is a doc-specific signal).'),
        folder: z
          .object({
            ok: z.boolean(),
            path: z.string(),
            action: z
              .string()
              .describe('`written` (created/updated) | `deleted` (cleared) | `noop`.'),
          })
          .optional()
          .describe('Folder frontmatter edit result.'),
        template: z
          .object({ ok: z.boolean(), path: z.string() })
          .optional()
          .describe('Template edit result.'),
        previewUrl: previewUrlOutputField.optional(),
        previewUrlSource: previewUrlSourceField,
        warning: previewAttachWarningField,
      }),
    },
    async (args: {
      document?: { path: string } & BodyEdit & { frontmatter?: FrontmatterPatch };
      folder?: { path: string; frontmatter: FrontmatterPatch };
      template?: { path: string } & BodyEdit & { frontmatter?: FrontmatterPatch };
      summary?: string;
      cwd?: string;
    }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, config, url } = context;
      const contentDir = resolveContentDir(config, cwd);
      const autoOpen = config.appearance.preview.autoOpen;

      const teaching = exactlyOneTargetError(args as Record<string, unknown>, [
        'document',
        'folder',
        'template',
      ]);
      if (teaching) return textResult(`Error: ${teaching}`, true);

      if (args.document !== undefined) {
        const docTeaching = bodyOrFrontmatterError(args.document, 'document');
        if (docTeaching) return textResult(`Error: ${docTeaching}`, true);
        if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
        if (args.document.frontmatter !== undefined) {
          return handleDocFrontmatter(
            { path: args.document.path, frontmatter: args.document.frontmatter },
            args,
            cwd,
            url,
            deps,
            autoOpen,
          );
        }
        return handleDocBody(args.document, args, cwd, contentDir, url, deps, autoOpen);
      }
      if (args.folder !== undefined) return handleFolder(args.folder, args.summary, url, deps);
      return handleTemplate(
        args.template as NonNullable<typeof args.template>,
        args.summary,
        cwd,
        url,
        deps,
      );
    },
  );
}
