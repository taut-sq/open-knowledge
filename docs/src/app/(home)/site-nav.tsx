'use client';

import { Menu, Star, X } from 'lucide-react';
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
  showStars?: boolean;
};

const docsLink: NavLink = { href: '/docs', label: 'Docs', external: false };

const socialLinks: NavLink[] = [
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

const githubLink: NavLink = {
  href: 'https://github.com/inkeep/open-knowledge',
  label: 'GitHub',
  external: true,
  icon: GitHubIcon,
  showStars: true,
};

const mobileLinks: NavLink[] = [docsLink, ...socialLinks, githubLink];

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const starFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullStarFormatter = new Intl.NumberFormat('en-US');

function NavLinkContent({ link }: { link: NavLink }) {
  const Icon = link.icon;
  return (
    <>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {link.iconOnly ? null : link.label}
    </>
  );
}

function NavItem({ link, className }: { link: NavLink; className: string }) {
  const ariaLabel = link.iconOnly ? link.label : undefined;
  return link.external ? (
    <a
      href={link.href}
      target="_blank"
      rel="noreferrer"
      aria-label={ariaLabel}
      className={className}
    >
      <NavLinkContent link={link} />
    </a>
  ) : (
    <Link href={link.href} aria-label={ariaLabel} className={className}>
      <NavLinkContent link={link} />
    </Link>
  );
}

function StarCount({ stars }: { stars: number }) {
  return (
    <>
      <Star
        className="size-3.5 shrink-0 text-golden-sun-300 fill-golden-sun-300"
        aria-hidden="true"
      />
      {starFormatter.format(stars)}
    </>
  );
}

function GitHubStarButton({
  link,
  stars,
  variant,
}: {
  link: NavLink;
  stars: number | null;
  variant: 'pill' | 'row';
}) {
  const Icon = link.icon;
  const title = stars != null ? `${fullStarFormatter.format(stars)} GitHub stars` : undefined;

  if (variant === 'row') {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        title={title}
        className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-slide-text transition-colors hover:bg-slide-bg-elevated"
      >
        <span className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
          {link.label}
        </span>
        {stars != null ? (
          <span className="flex items-center gap-1.5 tabular-nums text-slide-muted">
            <StarCount stars={stars} />
          </span>
        ) : null}
      </a>
    );
  }

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-stretch overflow-hidden rounded-full border text-slide-muted hover:text-slide-text transition-colors hover:bg-slide-bg-elevated h-9"
    >
      <span className="flex items-center gap-1.5 px-2.5 py-1.5">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        {link.label}
      </span>
      {stars != null ? (
        <span
          title={title}
          className="flex items-center gap-1.5 border-l px-2.5 py-1.5 tabular-nums"
        >
          <StarCount stars={stars} />
        </span>
      ) : null}
    </a>
  );
}

export function SiteNav({ stars }: { stars: number | null }) {
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
        <div className="flex items-center gap-6">
          <Link href="/" aria-label="OpenKnowledge home" className="inline-flex items-center">
            <OkWordmark aria-label="OpenKnowledge" className="h-8 w-auto text-slide-text" />
          </Link>
          <nav
            aria-label="Primary"
            className="hidden items-center gap-6 text-sm text-slide-muted md:flex uppercase font-mono"
          >
            <NavItem
              link={docsLink}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-slide-text"
            />
          </nav>
        </div>

        <nav
          aria-label="Secondary"
          className="hidden items-center gap-6 text-sm text-slide-muted md:flex uppercase font-mono"
        >
          {socialLinks.map((link) => (
            <NavItem
              key={link.href}
              link={link}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-slide-text"
            />
          ))}
          <span aria-hidden="true" className="h-5 w-px bg-slide-border" />
          <GitHubStarButton link={githubLink} stars={stars} variant="pill" />
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
        <nav
          aria-label="Mobile"
          className="container mx-auto flex flex-col gap-1 px-6 py-4 text-base uppercase font-mono"
        >
          {mobileLinks.map((link) =>
            link.showStars ? (
              <GitHubStarButton key={link.href} link={link} stars={stars} variant="row" />
            ) : (
              <NavItem
                key={link.href}
                link={link}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-slide-text transition-colors hover:bg-slide-bg-elevated"
              />
            ),
          )}
          <MarketingButton href={DOWNLOAD_ROUTE} size="md" className="text-base" showIcon>
            Download
          </MarketingButton>
        </nav>
      </div>
    </header>
  );
}
