import { initFrontendTelemetry } from './telemetry';

initFrontendTelemetry();

import '@/lib/perf/scheduler-polyfill-shim';

import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NavigatorApp } from '@/components/NavigatorApp';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@/lib/desktop-bridge-types';
import { installClientFetchWrapper } from '@/lib/client-fetch';
import { installConsentListener } from '@/lib/consent-store';
import { i18n } from '@/lib/i18n';
import { installClientLogForwarder } from '@/lib/install-client-log-forwarder';
import { installDeepLinkListener } from '@/lib/install-deep-link-listener';
import { installOnboardingToastListener } from '@/lib/install-onboarding-toast';
import { installServerDriftListener } from '@/lib/install-server-drift-listener';
import { installMcpConsentListener } from '@/lib/mcp-consent-store';
import { initWebVitals } from '@/lib/perf';
import {
  installColdMountInstrumentation,
  shouldInstallColdMountInstrumentation,
} from '@/lib/perf/cold-mount-instrumentation';
import { installShareReceivedListener } from '@/lib/share/receive-store';
import { seedInitialDocHashFromWindow } from '@/lib/single-file-initial-doc';
import { installUpdateNoticesBridge } from '@/lib/update-notices-store';
import { App } from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'react-medium-image-zoom/dist/styles.css';
import 'katex/dist/katex.min.css';
import './globals.css';

installClientFetchWrapper({
  apiOrigin: typeof window !== 'undefined' ? window.okDesktop?.config.apiOrigin : undefined,
});

installClientLogForwarder();

if (shouldInstallColdMountInstrumentation()) {
  installColdMountInstrumentation();
}
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  initWebVitals();
}

installUpdateNoticesBridge();

if (typeof window !== 'undefined') {
  installDeepLinkListener({ bridge: window.okDesktop });
}

if (typeof window !== 'undefined') {
  installServerDriftListener({ bridge: window.okDesktop });
}

if (typeof window !== 'undefined') {
  installMcpConsentListener({ bridge: window.okDesktop });
}

if (typeof window !== 'undefined') {
  installConsentListener({ bridge: window.okDesktop });
}

if (typeof window !== 'undefined') {
  installOnboardingToastListener({ bridge: window.okDesktop });
}

if (typeof window !== 'undefined') {
  installShareReceivedListener({ bridge: window.okDesktop });
}

seedInitialDocHashFromWindow();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const isNavigator = typeof window !== 'undefined' && window.okDesktop?.config.mode === 'navigator';

createRoot(root).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="ok-theme-v1"
        >
          <TooltipProvider>
            {isNavigator && window.okDesktop ? <NavigatorApp bridge={window.okDesktop} /> : <App />}
          </TooltipProvider>
          {/*
           * Sonner toaster for ad-hoc status/error toasts (clone dialog, file
           * tree, etc.). Auto-update notices are NOT routed here — they live
           * in the sidebar footer via <UpdateNotices /> for a persistent home
           * that matches their permanent-until-clicked semantics.
           */}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
