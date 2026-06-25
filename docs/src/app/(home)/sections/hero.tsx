'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ClaudeIcon } from '@/components/icons/claude';
import { CodexBrandIcon } from '@/components/icons/codex';
import { CursorIcon } from '@/components/icons/cursor';
import { DOWNLOAD_URL, SITE_HEADLINE } from '@/lib/site';
import { cn } from '@/lib/utils';
import { DotTexture } from '../dot-texture';
import { MarketingButton } from '../marketing-button';
import { Section } from '../section';
import SectionHeading from '../section-heading';
import { HeroPreview, type HeroPreviewAgentId } from './hero-preview';

const AGENTS = [
  { id: 'claude', label: 'Claude', Icon: ClaudeIcon, brandColor: '#D97757' },
  { id: 'cursor', label: 'Cursor', Icon: CursorIcon, brandColor: 'var(--slide-text)' },
  { id: 'codex', label: 'Codex', Icon: CodexBrandIcon, brandColor: '#7A9DFF' },
] as const satisfies ReadonlyArray<{
  id: HeroPreviewAgentId;
  label: string;
  Icon: typeof ClaudeIcon;
  brandColor: string | undefined;
}>;

type AgentId = (typeof AGENTS)[number]['id'];

export function Hero() {
  const [activeId, setActiveId] = useState<AgentId>('claude');

  return (
    <Section className="relative min-h-screen overflow-hidden">
      <DotTexture variant="right" priority className="top-0 right-0 w-60 sm:w-[680px]" />
      <DotTexture variant="left" className="bottom-0 left-0 w-40 sm:w-72 lg:w-[515px]" />
      <div className="container relative z-10 mx-auto flex flex-col items-center text-center">
        <SectionHeading
          className="items-center"
          tag="Open source"
          headingClassName="sm:text-6xl text-5xl"
          description="A rich text editor for you and your agents. Private, open source, and free."
        >
          {SITE_HEADLINE}
        </SectionHeading>

        <div className="mt-6 flex items-center justify-center gap-4">
          <MarketingButton
            href={DOWNLOAD_URL}
            target="_blank"
            size="md"
            showIcon
            iconDirection="down"
          >
            Download for macOS
          </MarketingButton>
          <Link
            href="/docs/get-started/quickstart#ok-install-web-app-linux-windows-intel-mac"
            className="font-mono text-sm text-slide-muted underline-offset-4 transition-colors hover:text-slide-text hover:underline"
          >
            or CLI
          </Link>
        </div>

        <div className="mt-16 flex justify-center">
          <div
            className="inline-flex items-center gap-3 rounded-full border bg-slide-bg py-1.5 pr-1.5 pl-5"
            id="hero-agent-label"
          >
            <span className="font-mono text-sm uppercase tracking-wide text-slide-muted">
              Use with
            </span>
            <div
              role="radiogroup"
              aria-labelledby="hero-agent-label"
              className="flex items-center gap-1"
            >
              {AGENTS.map(({ id, label, Icon, brandColor }) => (
                // biome-ignore lint/a11y/useSemanticElements: chip is a button styled with icon+label; <input type="radio"> would force a visually-hidden input + label workaround for the same role.
                <button
                  key={id}
                  type="button"
                  role="radio"
                  onClick={() => setActiveId(id)}
                  aria-checked={activeId === id}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5  text-sm font-semibold transition-colors',
                    activeId === id
                      ? 'bg-slide-bg-elevated text-slide-text shadow-sm ring-1 ring-slide-border/20'
                      : 'text-slide-text/70 hover:text-slide-text',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" style={{ color: brandColor }} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative mt-4 w-full overflow-hidden rounded-[28px]">
          <Image
            src="/images/home/hero-box-background.webp"
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 1024px) 80vw, 100vw"
            priority
            className="object-cover"
          />
          <div
            className="relative z-10 aspect-3/4 w-full overflow-hidden rounded-[28px] border border-white/20 p-3 backdrop-blur-[20px] sm:aspect-square sm:p-4 md:aspect-video md:p-5"
            style={{
              backgroundColor: 'rgba(255, 254, 254, 0.18)',
              boxShadow: '6px 6px 24px rgba(153, 173, 205, 0.2)',
            }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-xl">
              {AGENTS.map(({ id }) => (
                <div
                  key={id}
                  aria-hidden={activeId !== id}
                  className={cn(
                    'absolute inset-0 transition-opacity duration-500 ease-out',
                    activeId === id ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <HeroPreview agentId={id} active={activeId === id} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
