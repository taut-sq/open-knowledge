import type { ComponentType, SVGProps } from 'react';
import { ClaudeIcon } from './claude';
import { CodexIcon } from './codex';
import { CursorIcon } from './cursor';
import { GitHubIcon } from './github';
import { McpIcon } from './mcp';
import { ObsidianIcon } from './obsidian';
import { OpenClawIcon } from './openclaw';
import { OpenCodeIcon } from './opencode';

export const brandIcons = {
  Claude: ClaudeIcon,
  Cursor: CursorIcon,
  Codex: CodexIcon,
  OpenCode: OpenCodeIcon,
  OpenClaw: OpenClawIcon,
  GitHub: GitHubIcon,
  Obsidian: ObsidianIcon,
  MCP: McpIcon,
} as const satisfies Record<string, ComponentType<SVGProps<SVGSVGElement>>>;

export type BrandIconName = keyof typeof brandIcons;
