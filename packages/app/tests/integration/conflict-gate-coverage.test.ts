import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_EXT_PATH = join(import.meta.dirname, '../../../server/src/api-extension.ts');
const source = readFileSync(API_EXT_PATH, 'utf8');

const REQUIRED_HANDLERS = [
  'handleAgentWrite',
  'handleAgentWriteMd',
  'handleAgentPatch',
  'handleAgentUndo',
  'handleRollback',
  'handleRenamePath',
  'handleDeletePath',
  'handleDuplicatePath',
  'handleTemplate',
  'handleTemplatePut',
  'handleTemplateDelete',
  'handleTemplateMove',
];

const EXEMPT_HANDLERS = new Set([
  'handleDocumentRead',
  'handleDocumentList',
  'handleAsset',
  'handleAssetText',
  'handleBacklinks',
  'handleBacklinkCounts',
  'handleForwardLinks',
  'handleLinkGraph',
  'handleSearch',
  'handleSemanticStatus',
  'handleDeadLinks',
  'handleOrphans',
  'handleHubs',
  'handleTagsList',
  'handleTagsForName',
  'handlePages',
  'handleFolderConfig',
  'handleTemplatesList',
  'handleSuggestLinks',
  'handlePageHeadings',
  'handleHistory',
  'handleHistoryVersion',
  'handleMetricsReconciliation',
  'handleMetricsParseHealth',
  'handleMetricsAgentPresence',
  'handleEmbedDetect',
  'handleClientLogs',
  'handleWorkspace',
  'handleApiConfig',
  'handleRescueList',
  'handleSyncStatus',
  'handleSyncConflicts',
  'handleSyncConflictContent',
  'handleSyncTrigger',
  'handleSyncResolveConflict',
  'handlePrincipal',
  'handleInstalledAgentsRoute',
  'handleServerInfo',
  'handleAgentActivity',
  'handleAgentBurstDiff',
  'handleTemplateGet',
  'handleLocalOpClone',
  'handleLocalOpOkInit',
  'handleLocalOpAuthLogin',
  'handleLocalOpAuthStatus',
  'handleLocalOpAuthRepos',
  'handleLocalOpAuthSignout',
  'handleLocalOpAuthSetIdentity',
  'handleLocalOpEmbeddingsSetKey',
  'handleLocalOpEmbeddingsClearKey',
  'handleSpawnCursorRoute',
  'handleHandoffDispatchRoute',
  'handleInstallSkill',
  'handleSkillInstallState',
  'handleSeedPlan',
  'handleSeedApply',
  'handleSeedPacks',
  'handleShareConstructUrl',
  'handleSharePublishOwners',
  'handleSharePublishNameCheck',
  'handleSharePublish',
  'handleBranchInfo',
  'handleCheckout',
  'handleTestReset',
  'handleTestRescanBacklinks',
  'handleTestRescanFiles',
  'handleSaveVersion',
  'handleCreatePage',
  'handleCreateFolder',
  'handleTrashCleanup',
  'handleUploadAsset',
  'handleFrontmatterPatch',
]);

function extractHandlerBody(handlerName: string): string | null {
  const fnDecl = `async function ${handlerName}(`;
  const constDecl = `const ${handlerName} = withValidation(`;
  const fnIdx = source.indexOf(fnDecl);
  const constIdx = source.indexOf(constDecl);
  let start = -1;
  if (fnIdx !== -1) start = fnIdx;
  else if (constIdx !== -1) start = constIdx;
  if (start === -1) return null;
  const nextFn = source.indexOf('\n  async function handle', start + 1);
  const nextConst = source.indexOf('\n  const handle', start + 1);
  const nextRoutes = source.indexOf('\n  const routes:', start + 1);
  const candidates = [nextFn, nextConst, nextRoutes].filter((i) => i !== -1);
  const next = candidates.length === 0 ? -1 : Math.min(...candidates);
  return source.slice(start, next === -1 ? source.length : next);
}

function extractStaticRouteHandlerNames(): string[] {
  const routesStart = source.indexOf('\n  const routes:');
  const enableTestRoutes = source.indexOf('\n  if (enableTestRoutes)', routesStart);
  const slice =
    routesStart === -1
      ? ''
      : source.slice(routesStart, enableTestRoutes === -1 ? source.length : enableTestRoutes);
  return [...slice.matchAll(/:\s*(handle\w+)/g)].map((m) => m[1]);
}

describe('conflict-gate coverage (FR9)', () => {
  test('every required mutating handler has a conflict gate (direct or via spine)', () => {
    const failures: string[] = [];
    for (const handler of REQUIRED_HANDLERS) {
      const body = extractHandlerBody(handler);
      if (body === null) {
        failures.push(`${handler}: function not found in source`);
        continue;
      }
      const directGate =
        body.includes('respondDocInConflict(') || body.includes('checkTemplateConflictGate(');
      const spineRouting =
        body.includes('applyAgentMarkdownWrite(') || body.includes('applyAgentUndo(');
      const dispatcherRouting =
        body.includes('handleTemplatePut(') ||
        body.includes('handleTemplateDelete(') ||
        body.includes('handleTemplateMove(');
      if (!directGate && !spineRouting && !dispatcherRouting) {
        failures.push(
          `${handler}: missing conflict gate — must call respondDocInConflict(...) directly, route through applyAgentMarkdownWrite/applyAgentUndo, or dispatch to a gated sub-handler`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  test('every handler in the static route registry is tracked as required or exempt', () => {
    const names = extractStaticRouteHandlerNames();
    const required = new Set(REQUIRED_HANDLERS);
    const untracked = names.filter((h) => !required.has(h) && !EXEMPT_HANDLERS.has(h));
    expect(untracked).toEqual([]);
  });

  test('spine-level gate fires before transact in agent-sessions.ts', () => {
    const sessionsSrc = readFileSync(
      join(import.meta.dirname, '../../../server/src/agent-sessions.ts'),
      'utf8',
    );
    expect(sessionsSrc).toContain('throw new DocInConflictError');
    const throwMatches = sessionsSrc.match(/throw new DocInConflictError/g) ?? [];
    expect(throwMatches.length).toBeGreaterThanOrEqual(2);
  });
});
