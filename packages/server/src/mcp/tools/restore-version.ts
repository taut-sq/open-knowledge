import { AdvisoryWarningSchema } from '@inkeep/open-knowledge-core';
import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import { formatAdvisoryLines, parseAdvisoryWarnings } from './advisory-warnings.ts';
import { resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  agentIdentityFields,
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  httpPost,
  normalizeDocName,
  outputSchemaWithText,
  previewUrlOutputField,
  previewUrlSourceField,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  summaryArgSchema,
  summaryOutputSchema,
  textPlusStructured,
  textResult,
  versionInputSchema,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Restore a single document to a historical version via the CRDT layer — append-only (creates a new version with the old content; all connected editors see the change live).',
  '',
  '**Parameters:**',
  '- `document` — The document to restore (path, no extension; trailing `.md`/`.mdx` is stripped).',
  '- `version` — The 40-character commit SHA to restore to. Copy it from the `history` tool (same field name there).',
  '- `summary` — Optional one-line summary (≤80 chars). Defaults to "Restored to <sha-short>". Avoid secrets or PII — persisted to git history.',
  '',
  'A response may include `structuredContent.warnings` (kind `content-divergence`) when the restored `Y.Text` does not byte-match the target-version bytes. The restore still landed; re-read the doc with `exec("cat <document>")` to see what converged.',
].join('\n');

export interface RestoreVersionDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  identityRef?: { current: AgentIdentity };
}

export function register(server: ServerInstance, deps: RestoreVersionDeps): void {
  server.registerTool(
    'restore_version',
    {
      description: DESCRIPTION,
      inputSchema: {
        document: z.string().describe('Document to restore (path, no extension).'),
        version: versionInputSchema.describe(
          "The 40-character commit SHA to restore to — copy it straight from a `history` entry's `version` field (same name there).",
        ),
        summary: summaryArgSchema.describe(
          'Optional one-line summary (≤80 chars). Defaults to "Restored to <sha-short>". Persisted to git history.',
        ),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: outputSchemaWithText({
        document: z.string().describe('The document that was restored (echo of the input).'),
        version: z
          .string()
          .describe('The version the document was restored to (echo of the input).'),
        previewUrl: previewUrlOutputField,
        previewUrlSource: previewUrlSourceField,
        summary: summaryOutputSchema.optional(),
        warnings: z
          .array(AdvisoryWarningSchema)
          .min(1)
          .optional()
          .describe(
            'Advisory entries (kind `content-divergence`): present only when the restored Y.Text did not byte-match the target version.',
          ),
      }),
    },
    async (args: { document: string; version: string; summary?: string; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const normalized = normalizeDocName(args.document);
      if (!normalized.ok) return textResult(normalized.error, true);
      const docName = normalized.docName;

      const versionResult = await httpGet(
        url,
        `/api/history/${args.version}?docName=${encodeURIComponent(docName)}`,
      );
      if (!versionResult.ok) {
        return textResult(`Error: ${versionResult.error ?? 'Version not found'}`, true);
      }

      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/rollback', {
        docName,
        commitSha: args.version,
        ...(args.summary !== undefined ? { summary: args.summary } : {}),
        ...agentIdentityFields(identity),
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const summaryResult =
        result.summary && typeof result.summary === 'object'
          ? (result.summary as { value: string; truncatedFrom?: number; hint?: string })
          : undefined;
      const summaryHint = typeof summaryResult?.hint === 'string' ? summaryResult.hint : undefined;

      const advisoryWarnings = parseAdvisoryWarnings(result.warnings);

      const author = typeof versionResult.author === 'string' ? versionResult.author : undefined;
      const timestamp =
        typeof versionResult.timestamp === 'string' ? versionResult.timestamp : undefined;
      const provenance = author && timestamp ? ` (${author}, ${timestamp})` : '';
      const textLines = [
        `Restored "${docName}" to version ${args.version.slice(0, 8)}${provenance}. The change has been applied to all connected editors.`,
      ];
      if (summaryHint) textLines.push(summaryHint);
      if (advisoryWarnings) {
        textLines.push(...formatAdvisoryLines(advisoryWarnings));
      }

      const preview = await resolvePreviewUrlForTool(
        docName,
        { config: deps.config, resolveCwd: deps.resolveCwd },
        cwd,
      );
      return textPlusStructured(textLines.join('\n'), {
        document: docName,
        version: args.version,
        previewUrl: preview?.url ?? null,
        ...(preview ? { previewUrlSource: preview.source } : {}),
        ...(summaryResult ? { summary: summaryResult } : {}),
        ...(advisoryWarnings ? { warnings: advisoryWarnings } : {}),
      });
    },
  );
}
