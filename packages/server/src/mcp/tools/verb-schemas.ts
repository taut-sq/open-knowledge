
import { FrontmatterValueSchema } from '@inkeep/open-knowledge-core';
import { z } from 'zod';

const FrontmatterPatchValue = z.union([FrontmatterValueSchema, z.null()]);

export const FrontmatterArg = z
  .record(z.string(), FrontmatterPatchValue)
  .describe(
    'Metadata as a flat key→value map (string | number | boolean | string[]). ' +
      'Merge-patch: include a key to set it, set a key to null to delete it; keys you omit are unchanged. ' +
      'Example: { title: "Q3 Planning", tags: ["planning"], status: "draft" }.',
  );

const POSITIONS = ['append', 'prepend', 'replace'] as const;
export const PositionArg = z
  .enum(POSITIONS)
  .describe(
    'Where content lands. replace = overwrite the whole body (default for a new doc; required for an existing doc). ' +
      'append / prepend = add to the end / start.',
  );

export function splitTargetPath(path: string): { folder: string; name: string } {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  return idx === -1
    ? { folder: '', name: clean }
    : { folder: clean.slice(0, idx), name: clean.slice(idx + 1) };
}

const TEMPLATE_NAME_REGEX = /^[A-Za-z0-9_-]+$/;
export const TEMPLATE_PATH_DESCRIBE =
  'Template path = `<folder>/<name>` (e.g. "fishing-log/trip-log"). The slashes are the folder it belongs to; the final segment is the template name (letters, digits, `_`, `-` only — no dots/spaces). Stored at `<folder>/.ok/templates/<name>.md`.';
export const TEMPLATE_CONTENT_DESCRIBE =
  'Template Markdown body. Only the `{{date}}` and `{{user}}` substitution tokens are allowed; any other `{{...}}` token hard-errors at write time.';

export function resolveTemplatePath(
  path: string,
): { ok: true; folder: string; name: string } | { ok: false; error: string } {
  const { folder, name } = splitTargetPath(path);
  if (!TEMPLATE_NAME_REGEX.test(name)) {
    return {
      ok: false,
      error: `the final segment of a template path is its name — "${name}" must be letters, digits, \`_\`, \`-\` only (no dots/spaces). e.g. { template: { path: "fishing-log/trip-log" } }.`,
    };
  }
  return { ok: true, folder, name };
}

export function exactlyOneTargetError(
  args: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  const present = keys.filter((k) => args[k] !== undefined);
  if (present.length === 1) return null;
  const quoted = keys.map((k) => `\`${k}\``).join(', ');
  if (present.length === 0) {
    return (
      `Name exactly one of ${quoted} — the one thing you are addressing. ` +
      "Nest that target's fields under its key (e.g. `{ document: { path, … } }`); " +
      "see this tool's parameter docs for which fields each target takes."
    );
  }
  return `You named ${present.map((k) => `\`${k}\``).join(' and ')} — name exactly ONE target.`;
}
