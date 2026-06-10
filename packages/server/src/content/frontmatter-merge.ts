
import { type FrontmatterValue, isFrontmatterValueEmpty } from '@inkeep/open-knowledge-core';

export type FrontmatterRecord = Record<string, unknown>;

export function mergePatch(
  existing: FrontmatterRecord,
  patch: FrontmatterRecord,
): FrontmatterRecord {
  const result: FrontmatterRecord = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (isEmpty(value)) {
      delete result[key];
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function dropEmpties(input: FrontmatterRecord): FrontmatterRecord {
  const result: FrontmatterRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

function isEmpty(value: unknown): boolean {
  return isFrontmatterValueEmpty(value as FrontmatterValue | null);
}
