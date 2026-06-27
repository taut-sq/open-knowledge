'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import type { FC, SVGProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { DiscordIcon } from '@/components/icons/discord';
import { GitHubIcon } from '@/components/icons/github';
import { XIcon } from '@/components/icons/x';
import { OkWordmark } from '@/components/ok-wordmark';
import { DOWNLOAD_ROUTE } from '@/lib/site';
import { MarketingButton } from './marketing-button';

type NavLink = {
  href: string;
  label: string;
  external: boolean;
  icon?: FC<SVGProps<SVGSVGElement>>;
  iconOnly?: boolean;
};

const navLinks: NavLink[] = [
  { href: '/docs', label: 'Docs', external: false },
  {
    href: 'https://github.com/inkeep/open-knowledge',
    label: 'GitHub',
    external: true,
    icon: GitHubIcon,
  },
  {
    href: 'https://x.com/OpenKnowledgeAI',
    label: 'X',
    external: true,
    icon: XIcon,
    iconOnly: true,
  },
  {
    href: 'https://discord.com/invite/YujKpFN49',
    label: 'Discord',
    external: true,
    icon: DiscordIcon,
    iconOnly: true,
  },
];

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const menu = menuRef.current;
    const firstFocusable = menu?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    firstFocusable?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !menu) return;
      const focusables = menu.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevBodyOverflow;
      (triggerRef.current ?? previouslyFocused)?.focus();
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 bg-fd-background/80 backdrop-blur supports-backdrop-filter:bg-fd-background/70">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link href="/" aria-label="OpenKnowledge home" className="inline-flex items-center">
          <OkWordmark aria-label="OpenKnowledge" className="h-8 w-auto text-slide-text" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slide-muted md:flex uppercase font-mono">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const content = (
              <>
                {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
                {link.iconOnly ? null : link.label}
              </>
            );
            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                aria-label={link.iconOnly ? link.label : undefined}
                className="inline-flex items-center gap-1.5 transition-colors hover:text-slide-text"
              >
                {content}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                aria-label={link.iconOnly ? link.label : undefined}
                className="inline-flex items-center gap-1.5 transition-colors hover:text-slide-text"
              >
                {content}
              </Link>
            );
          })}
          <MarketingButton href={DOWNLOAD_ROUTE} size="sm">
            Download
          </MarketingButton>
        </nav>

        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slide-muted opacity-60 transition-colors hover:bg-slide-bg-elevated hover:text-slide-text md:hidden"
          aria-expanded={open}
          aria-controls="site-nav-mobile"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <Menu className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div
        ref={menuRef}
        id="site-nav-mobile"
        hidden={!open}
        className="border-t bg-fd-background md:hidden"
      >
        <nav className="container mx-auto flex flex-col gap-1 px-6 py-4 text-base uppercase font-mono">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const content = (
              <>
                {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
                {link.iconOnly ? null : link.label}
              </>
            );
            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                aria-label={link.iconOnly ? link.label : undefined}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-slide-text transition-colors hover:bg-slide-bg-elevated"
              >
                {content}
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                aria-label={link.iconOnly ? link.label : undefined}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-slide-text transition-colors hover:bg-slide-bg-elevated"
              >
                {content}
              </Link>
            );
          })}
          <MarketingButton href={DOWNLOAD_ROUTE} size="md" className="text-base" showIcon>
            Download
          </MarketingButton>
        </nav>
      </div>
    </header>
  );
}
