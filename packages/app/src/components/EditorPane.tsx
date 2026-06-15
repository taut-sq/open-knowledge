import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TagDialog } from '@/editor/components/TagDialog';
import { useDocumentContext } from '@/editor/DocumentContext';
import { RAW_MDX_NAV_EVENT, type RawMdxNavDetail } from '@/editor/extensions/raw-mdx-nav-event';
import { rememberPendingSourceNavigation } from '@/editor/source-editor-navigation';
import { type EditorModeValue, useEditorMode } from '@/editor/use-editor-mode';
import { useGitSyncStatus } from '@/hooks/use-git-sync-status';
import { useNoPushPermissionToast } from '@/hooks/use-no-push-permission-toast';
import { useConfigContext } from '@/lib/config-provider';
import { useWorkspace } from '@/lib/use-workspace';
import { AuthModal } from './AuthModal';
import { AutoSyncOnboardingDialog } from './AutoSyncOnboardingDialog';
import { shouldShowAutoSyncOnboarding } from './auto-sync-onboarding-gate';
import { type PanelTab, TABS } from './DocPanel';
import { EditorArea } from './EditorArea';
import { EditorHeader } from './EditorHeader';
import { OpenInAgentMenuRequestProvider } from './handoff/OpenInAgentMenuRequestContext';
import {
  buildSelectionOrDocHandoffInput,
  type HandoffDispatchInput,
} from './handoff/useHandoffDispatch';

export type EditorMode = EditorModeValue;

interface EditorPaneProps {
  onOpenSearch?: () => void;
}

export function EditorPane({ onOpenSearch }: EditorPaneProps = {}) {
  const { t } = useLingui();
  const [persistedMode, setPersistedMode] = useEditorMode();
  const [editorMode, setEditorMode] = useState<EditorMode>(persistedMode);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialStep, setAuthInitialStep] = useState<'auth' | 'identity'>('auth');
  const [activeTab, setActiveTab] = useState<PanelTab>(TABS[0].id);
  const [autoSyncOnboardingDismissed, setAutoSyncOnboardingDismissed] = useState(false);
  const [openInAgentMenuOpen, setOpenInAgentMenuOpen] = useState(false);
  const [openInAgentMenuInput, setOpenInAgentMenuInput] = useState<HandoffDispatchInput | null>(
    null,
  );

  const syncStatus = useGitSyncStatus();
  const { projectLocalConfig, projectLocalSynced } = useConfigContext();
  const workspace = useWorkspace();

  const { activeDocName } = useDocumentContext();

  const showAutoSyncOnboarding = shouldShowAutoSyncOnboarding({
    autoSyncOnboardingDismissed,
    hasRemote: syncStatus?.hasRemote,
    projectLocalSynced,
    projectLocalConfig,
    pushPermissionCheckStatus: syncStatus?.pushPermission?.checkStatus,
  });

  useEffect(() => {
    function onRawMdxNav(e: Event) {
      const detail = (e as CustomEvent<RawMdxNavDetail>).detail;
      if (detail && activeDocName) {
        rememberPendingSourceNavigation(activeDocName, { kind: 'raw-mdx', detail });
      }
      setEditorMode('source');
    }
    window.addEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
    return () => window.removeEventListener(RAW_MDX_NAV_EVENT, onRawMdxNav);
  }, [activeDocName]);

  useNoPushPermissionToast(syncStatus?.pausedReason);

  function handleModeChange(mode: EditorModeValue) {
    setEditorMode(mode);
    setPersistedMode(mode);
  }

  function handleOpenInAgentMenuOpenChange(open: boolean) {
    setOpenInAgentMenuOpen(open);
    if (!open) setOpenInAgentMenuInput(null);
  }

  return (
    <>
      <OpenInAgentMenuRequestProvider
        value={{
          openSelection(request) {
            const input = buildSelectionOrDocHandoffInput({
              docName: request.docName ?? activeDocName,
              workspace,
              instruction: request.instruction,
              selectionMarkdown: request.selectionMarkdown,
            });
            if (input === null) {
              toast.error(t`Couldn't send the selection — please try again.`);
              return false;
            }
            setOpenInAgentMenuInput(input);
            setOpenInAgentMenuOpen(true);
            return true;
          },
        }}
      >
        <EditorHeader
          onSignIn={() => {
            setAuthInitialStep('auth');
            setAuthModalOpen(true);
          }}
          onSetIdentity={() => {
            setAuthInitialStep('identity');
            setAuthModalOpen(true);
          }}
          onOpenSearch={onOpenSearch}
          openInAgentMenuOpen={openInAgentMenuOpen}
          openInAgentMenuInput={openInAgentMenuInput}
          onOpenInAgentMenuOpenChange={handleOpenInAgentMenuOpenChange}
        />
        <EditorArea
          editorMode={editorMode}
          onModeChange={handleModeChange}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
        />
      </OpenInAgentMenuRequestProvider>
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        identityPrompt={authInitialStep === 'identity'}
        onSuccess={() => {
          setAuthModalOpen(false);
        }}
      />
      <AutoSyncOnboardingDialog
        open={showAutoSyncOnboarding}
        onResolved={() => setAutoSyncOnboardingDismissed(true)}
      />
      <TagDialog />
      {/*
        Agent Activity Panel now lives inside DocPanel as the `'agent'` mode
        content (SPEC 2026-04-24-activity-panel-to-docpanel-mode-toggle).
        No longer mounted here — the mode toggle + DocumentContext
        (`docPanelMode` / `docPanelAgentId`) drive visibility. Presence-bar
        avatar clicks flip the DocPanel's mode + scope + trigger expand.
      */}
    </>
  );
}
