import {
  type AdvisoryWarning,
  AdvisoryWarningSchema,
  type BrokenLink,
  BrokenLinkSchema,
  type RenderWarning,
  type WriteWarning,
} from '@inkeep/open-knowledge-core';

export function parseAdvisoryWarnings(value: unknown): AdvisoryWarning[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const warnings = value.flatMap((entry) => {
    const parsed = AdvisoryWarningSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  return warnings.length > 0 ? warnings : undefined;
}

export function parseBrokenLinks(value: unknown): BrokenLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = BrokenLinkSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function formatBrokenLinkLines(links: BrokenLink[]): string[] {
  if (links.length === 0) return [];
  const header = `⚠ ${links.length} broken outbound link${
    links.length === 1 ? '' : 's'
  } — fix or remove (the write still landed):`;
  return [header, ...links.map((l) => `  • ${formatBrokenLink(l)}`)];
}

export function formatBrokenLinkBrief(links: BrokenLink[]): string | null {
  if (links.length === 0) return null;
  return `⚠ ${links.length} broken outbound link${
    links.length === 1 ? '' : 's'
  } (see brokenLinks).`;
}

function formatBrokenLink(link: BrokenLink): string {
  return link.resolvedTo
    ? `${link.href} → ${link.resolvedTo} (${link.reason})`
    : `${link.href} (${link.reason})`;
}

function integrityEntries(warnings: AdvisoryWarning[]): WriteWarning[] {
  return warnings.filter(
    (w): w is WriteWarning => w.kind === 'content-divergence' || w.kind === 'disk-edit-reconciled',
  );
}

function renderEntries(warnings: AdvisoryWarning[]): RenderWarning[] {
  return warnings.filter((w): w is RenderWarning => w.kind === 'mermaid-parse-error');
}

export function formatAdvisoryLines(warnings: AdvisoryWarning[]): string[] {
  const lines = integrityEntries(warnings).map(formatIntegrityLine);
  const render = renderEntries(warnings);
  if (render.length > 0) lines.push(formatRenderWarningsLine(render));
  return lines;
}

export function formatAdvisoryBriefs(warnings: AdvisoryWarning[]): string[] {
  const briefs = integrityEntries(warnings).map(formatIntegrityBrief);
  const render = renderEntries(warnings);
  if (render.length > 0) briefs.push(formatRenderWarningsBrief(render));
  return briefs;
}

function formatIntegrityLine(d: WriteWarning): string {
  return d.kind === 'content-divergence'
    ? `⚠ Content divergence: ${d.actualBytes} actual bytes vs ${d.intendedBytes} intended (byteDelta=${d.byteDelta}). ${d.hint ?? 'currentState carries the converged content (re-read only if it is truncated).'}`
    : `⚠ ${d.hint ?? 'An out-of-band edit was reconciled into this document before your edit landed on top — re-read for the combined result.'}`;
}

function formatIntegrityBrief(d: WriteWarning): string {
  return d.kind === 'content-divergence'
    ? `⚠ Content divergence: ${d.actualBytes} actual vs ${d.intendedBytes} intended (byteDelta=${d.byteDelta}).`
    : '⚠ Out-of-band disk edit reconciled before this write — re-read for the combined result.';
}

export function formatRenderWarningsLine(warnings: RenderWarning[]): string {
  const first = warnings[0];
  if (warnings.length === 1 && first) {
    const lineRef = first.line !== undefined ? ` (line ${first.line})` : '';
    const locator = first.fenceFirstLine === '' ? '(empty fence)' : `("${first.fenceFirstLine}")`;
    return `⚠ Mermaid fence ${first.fenceIndex} ${locator} will not render${lineRef}: ${firstMessageLine(first.message)} Fix the fence and re-edit.`;
  }
  const count = warnings.length >= 10 ? '10+' : String(warnings.length);
  return `⚠ ${count} mermaid fences will not render — see structuredContent.document.warnings (kind "mermaid-parse-error") for per-fence errors. Fix the fences and re-edit.`;
}

export function formatRenderWarningsBrief(warnings: RenderWarning[]): string {
  const count = warnings.length >= 10 ? '10+' : String(warnings.length);
  return `⚠ ${count} mermaid fence${warnings.length === 1 ? '' : 's'} will not render (see warnings).`;
}

function firstMessageLine(message: string): string {
  const line = message.split('\n', 1)[0]?.trim() ?? '';
  return line.endsWith('.') || line.endsWith(':') ? line : `${line}.`;
}
