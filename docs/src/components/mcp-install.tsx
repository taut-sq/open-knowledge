import type { ReactNode } from 'react';

export function McpInstall({ editor, children }: { editor: string; children?: ReactNode }) {
  return (
    <>
      <p>There are two ways to connect {editor}, depending on how you run OpenKnowledge:</p>
      <ul>
        <li>
          <strong>macOS desktop app.</strong> The first time you open a project, a consent dialog
          detects {editor} and configures it for you. To re-trigger the dialog, delete{' '}
          <code>~/.ok/mcp-status.json</code> and relaunch.
        </li>
        <li>
          <strong>Web app / terminal</strong> (Linux, Intel Mac — see the{' '}
          <a href="/docs/get-started/quickstart#ok-install-web-app-linux-windows-intel-mac">
            web app guide
          </a>
          ). Run <code>ok init</code> in your project: it registers the OpenKnowledge MCP server
          with {editor} and the other editors it detects. Every <code>ok start</code> refreshes the
          entry.
        </li>
      </ul>
      {children}
    </>
  );
}
