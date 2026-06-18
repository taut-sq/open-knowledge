import { ArrowRight, Bot, Database, type LucideIcon, NotebookPen } from 'lucide-react';
import type { ReactNode } from 'react';

interface Layer {
  k: string;
  Icon: LucideIcon;
  title: string;
  role: string;
  desc: ReactNode;
}

const LAYERS: Layer[] = [
  {
    k: 'LAYER 01',
    Icon: NotebookPen,
    title: 'Editor',
    role: 'What you touch',
    desc: (
      <>
        A beautiful macOS editor for your <code>.md</code> files: WYSIWYG or source mode, backlinks,
        the <code>[[Page]]</code> wiki-link syntax, frontmatter, asset embeds, and version history,
        with a live preview as agents work.
      </>
    ),
  },
  {
    k: 'LAYER 02',
    Icon: Bot,
    title: 'Knowledge Engine',
    role: 'The connective layer',
    desc: 'Thin MCP wrappers around system functions. Agents read and write through them, so every change automatically carries frontmatter, backlinks, and edit history.',
  },
  {
    k: 'LAYER 03',
    Icon: Database,
    title: 'Content',
    role: 'Your source of truth',
    desc: 'Plain markdown files in your project, version-controlled in git. No new database, no migration; your knowledge stays portable.',
  },
];

export function LayerStack() {
  return (
    <div className="ok-overview ok-stack not-prose relative mt-1.5 flex flex-col gap-3">
      {LAYERS.map((layer) => (
        <div
          key={layer.k}
          className="relative z-[1] flex items-start gap-[18px] rounded-xl border border-fd-border bg-fd-card px-[22px] py-5 shadow-sm"
        >
          <span
            className="grid size-[38px] shrink-0 place-items-center rounded-[10px] shadow-[0_0_0_5px_var(--color-fd-card)]"
            style={{ background: 'var(--ok-accent-soft)', color: 'var(--ok-accent-ink)' }}
          >
            <layer.Icon className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="mb-2 block font-mono text-[11px] tracking-[0.06em] text-fd-muted-foreground">
              {layer.k}
            </span>
            <h3 className="m-0 mb-[5px] text-[17px] font-semibold tracking-tight text-fd-foreground">
              {layer.title}
            </h3>
            <p className="m-0 text-[14.5px] leading-[1.55] text-fd-muted-foreground">
              {layer.desc}
            </p>
          </div>
          <span className="hidden shrink-0 self-center whitespace-nowrap rounded-full border border-fd-border bg-fd-muted px-3 py-[7px] text-[11px] font-semibold uppercase tracking-[0.05em] text-fd-muted-foreground md:inline-block">
            {layer.role}
          </span>
        </div>
      ))}
    </div>
  );
}

interface Path {
  href: string;
  title: string;
  desc: string;
}

const PATHS: Path[] = [
  {
    href: '/docs/get-started/quickstart',
    title: 'New to Open Knowledge? Run the Quickstart',
    desc: 'Install the desktop app and get your first agent-driven edit in under five minutes.',
  },
  {
    href: '/docs/integrations/claude-code',
    title: 'Setting up an editor?',
    desc: 'Pick yours from Integrations: Claude, Cursor, or Codex.',
  },
  {
    href: '/docs/reference/mcp',
    title: 'Looking up a tool or config field?',
    desc: 'Head to the MCP and Configuration reference.',
  },
];

export function WhereToStart() {
  return (
    <div className="ok-overview not-prose flex flex-col gap-2.5">
      {PATHS.map((path, i) => (
        <a
          key={path.href}
          href={path.href}
          className="group flex items-center gap-4 rounded-xl border border-fd-border bg-fd-card px-[18px] py-4 no-underline shadow-sm transition hover:-translate-y-px hover:border-[var(--ok-accent)]"
        >
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg font-mono text-[13px] font-semibold"
            style={{ background: 'var(--ok-accent-soft)', color: 'var(--ok-accent-ink)' }}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold text-fd-foreground">
              {path.title}
            </span>
            <span className="block text-[13.5px] leading-snug text-fd-muted-foreground">
              {path.desc}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-fd-muted-foreground transition-colors group-hover:text-[var(--ok-accent)]" />
        </a>
      ))}
    </div>
  );
}
