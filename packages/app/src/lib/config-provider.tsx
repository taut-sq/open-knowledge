import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  bindConfigDoc,
  bindOkignoreDoc,
  CONFIG_DOC_NAME_OKIGNORE,
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_PROJECT_LOCAL,
  CONFIG_DOC_NAME_USER,
  type Config,
  type ConfigBinding,
  mergeLayered,
  type OkignoreBinding,
  type WriteScope,
} from '@inkeep/open-knowledge-core';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useState } from 'react';
import * as Y from 'yjs';
import { useThemeBridge } from '@/hooks/use-theme-bridge';
import { buildAuthToken } from './auth-token';
import { ConfigContext, type ConfigContextValue } from './config-context';
import { useServerInstanceId } from './server-instance-store';

export { useConfigContext } from './config-context';

interface ScopedBinding {
  binding: ConfigBinding;
  config: Config;
  cleanup: () => void;
}

type CloseEventLike = { code: number; reason: string };

function logProviderEvent(
  role: string,
  docName: string,
  event: 'disconnect' | 'close',
  closeEvent: CloseEventLike | undefined,
) {
  console.warn(
    JSON.stringify({
      event: `ok-${role}-${event}`,
      docName,
      code: closeEvent?.code,
      reason: closeEvent?.reason ?? undefined,
    }),
  );
}

function makeBinding(
  collabUrl: string,
  docName: string,
  scope: WriteScope,
  serverInstanceId: string | null,
): ScopedBinding {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: collabUrl,
    name: docName,
    document: ydoc,
    token: buildAuthToken(null, serverInstanceId, null),
    onDisconnect: ({ event }) => logProviderEvent('config-provider', docName, 'disconnect', event),
    onClose: ({ event }) => logProviderEvent('config-provider', docName, 'close', event),
  });
  const binding = bindConfigDoc(provider, scope);
  const cleanup = () => {
    binding.dispose();
    provider.destroy();
    ydoc.destroy();
  };
  return { binding, config: binding.current(), cleanup };
}

interface OkignoreScoped {
  binding: OkignoreBinding;
  provider: HocuspocusProvider;
  cleanup: () => void;
}

function makeOkignoreBinding(collabUrl: string, serverInstanceId: string | null): OkignoreScoped {
  const ydoc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: collabUrl,
    name: CONFIG_DOC_NAME_OKIGNORE,
    document: ydoc,
    token: buildAuthToken(null, serverInstanceId, null),
    onDisconnect: ({ event }) =>
      logProviderEvent('okignore-provider', CONFIG_DOC_NAME_OKIGNORE, 'disconnect', event),
    onClose: ({ event }) =>
      logProviderEvent('okignore-provider', CONFIG_DOC_NAME_OKIGNORE, 'close', event),
  });
  const binding = bindOkignoreDoc(provider);
  const cleanup = () => {
    binding.dispose();
    provider.destroy();
    ydoc.destroy();
  };
  return { binding, provider, cleanup };
}

export function ConfigProvider({
  collabUrl,
  children,
}: {
  collabUrl: string | null;
  children: ReactNode;
}) {
  const serverInstanceId = useServerInstanceId();
  const [userState, setUserState] = useState<{
    binding: ConfigBinding;
    config: Config;
    synced: boolean;
  } | null>(null);
  const [projectState, setProjectState] = useState<{
    binding: ConfigBinding;
    config: Config;
  } | null>(null);
  const [projectLocalState, setProjectLocalState] = useState<{
    binding: ConfigBinding;
    config: Config;
    synced: boolean;
  } | null>(null);
  const [okignoreState, setOkignoreState] = useState<{
    binding: OkignoreBinding;
    synced: boolean;
  } | null>(null);

  useEffect(() => {
    if (collabUrl === null) return;
    const userScoped = makeBinding(collabUrl, CONFIG_DOC_NAME_USER, 'user', serverInstanceId);
    const projectScoped = makeBinding(
      collabUrl,
      CONFIG_DOC_NAME_PROJECT,
      'project',
      serverInstanceId,
    );
    const projectLocalScoped = makeBinding(
      collabUrl,
      CONFIG_DOC_NAME_PROJECT_LOCAL,
      'project-local',
      serverInstanceId,
    );
    const okignoreScoped = makeOkignoreBinding(collabUrl, serverInstanceId);
    setUserState({
      binding: userScoped.binding,
      config: userScoped.config,
      synced: userScoped.binding.hasSynced(),
    });
    setProjectState({ binding: projectScoped.binding, config: projectScoped.config });
    setProjectLocalState({
      binding: projectLocalScoped.binding,
      config: projectLocalScoped.config,
      synced: projectLocalScoped.binding.hasSynced(),
    });
    setOkignoreState({ binding: okignoreScoped.binding, synced: false });

    const unsubUser = userScoped.binding.subscribe((next) => {
      setUserState((prev) =>
        prev?.binding === userScoped.binding ? { ...prev, config: next } : prev,
      );
    });
    const unsubUserSynced = userScoped.binding.subscribeSynced(() => {
      setUserState((prev) =>
        prev?.binding === userScoped.binding ? { ...prev, synced: true } : prev,
      );
    });
    const unsubProject = projectScoped.binding.subscribe((next) => {
      setProjectState((prev) =>
        prev?.binding === projectScoped.binding ? { ...prev, config: next } : prev,
      );
    });
    const unsubProjectLocal = projectLocalScoped.binding.subscribe((next) => {
      setProjectLocalState((prev) =>
        prev?.binding === projectLocalScoped.binding ? { ...prev, config: next } : prev,
      );
    });
    const unsubProjectLocalSynced = projectLocalScoped.binding.subscribeSynced(() => {
      setProjectLocalState((prev) =>
        prev?.binding === projectLocalScoped.binding ? { ...prev, synced: true } : prev,
      );
    });
    const handleOkignoreSynced = () => {
      setOkignoreState((prev) =>
        prev?.binding === okignoreScoped.binding ? { ...prev, synced: true } : prev,
      );
    };
    okignoreScoped.provider.on('synced', handleOkignoreSynced);

    return () => {
      unsubUser();
      unsubUserSynced();
      unsubProject();
      unsubProjectLocal();
      unsubProjectLocalSynced();
      okignoreScoped.provider.off('synced', handleOkignoreSynced);
      for (const scoped of [userScoped, projectScoped, projectLocalScoped, okignoreScoped]) {
        try {
          scoped.cleanup();
        } catch (e) {
          console.warn(
            JSON.stringify({ event: 'ok-config-provider-cleanup-error', error: String(e) }),
          );
        }
      }
      setUserState((prev) => (prev?.binding === userScoped.binding ? null : prev));
      setProjectState((prev) => (prev?.binding === projectScoped.binding ? null : prev));
      setProjectLocalState((prev) => (prev?.binding === projectLocalScoped.binding ? null : prev));
      setOkignoreState((prev) => (prev?.binding === okignoreScoped.binding ? null : prev));
    };
  }, [collabUrl, serverInstanceId]);

  const merged: Config | null =
    userState && projectState
      ? mergeLayered(userState.config, projectState.config, projectLocalState?.config)
      : null;

  const { setTheme } = useTheme();
  const themeValue = merged?.appearance?.theme;
  useEffect(() => {
    if (themeValue === 'light' || themeValue === 'dark' || themeValue === 'system') {
      setTheme(themeValue);
    }
  }, [themeValue, setTheme]);

  useThemeBridge(
    typeof window !== 'undefined' ? window.okDesktop : undefined,
    themeValue ?? 'system',
  );

  const value: ConfigContextValue = {
    userBinding: userState?.binding ?? null,
    userSynced: userState?.synced ?? false,
    projectBinding: projectState?.binding ?? null,
    projectLocalBinding: projectLocalState?.binding ?? null,
    okignoreBinding: okignoreState?.binding ?? null,
    okignoreSynced: okignoreState?.synced ?? false,
    userConfig: userState?.config ?? null,
    projectConfig: projectState?.config ?? null,
    projectLocalConfig: projectLocalState?.config ?? null,
    projectLocalSynced: projectLocalState?.synced ?? false,
    merged,
  };

  return <ConfigContext value={value}>{children}</ConfigContext>;
}
