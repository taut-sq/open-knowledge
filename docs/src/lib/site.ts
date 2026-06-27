import { STABLE_DMG_URL } from './download-links';

export const SITE_URL = 'https://openknowledge.ai';
export const SITE_NAME = 'OpenKnowledge';
export const TWITTER_HANDLE = '@OpenKnowledgeAI';
export const SITE_DESCRIPTION =
  'An agent-native knowledge platform where humans and AI co-create. Real-time CRDT editing, markdown-native, connected to any AI agent via MCP.';

export const SITE_HEADLINE = 'Beautiful, AI-native markdown editor.';

const DESCRIPTION_MAX = 160;

export function metaDescription(
  text: string | null | undefined,
  fallback: string = SITE_DESCRIPTION,
): string {
  const normalized = (text ?? '').replace(/\s+/g, ' ').trim();
  const base = normalized.length > 0 ? normalized : fallback;
  if (base.length <= DESCRIPTION_MAX) return base;
  const slice = base.slice(0, DESCRIPTION_MAX - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > DESCRIPTION_MAX * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

export const DOWNLOAD_URL = STABLE_DMG_URL;

export const DOWNLOAD_ROUTE = '/download/stable';

export const EXAMPLE_KB_SHARE_URL =
  'https://openknowledge.ai/d/AWh0dHBzOi8vZ2l0aHViLmNvbS9pbmtlZXAvdGVjaC1pcG9zL2Jsb2IvbWFpbi9SRUFETUUubWQ';
