'use client';

import {
  BookOpen,
  ChevronRight,
  Code2,
  Compass,
  Image as ImageIcon,
  Info,
  LayoutPanelTop,
  MessageSquareWarning,
  Network,
  PenLine,
  Play,
  Video as VideoIcon,
  Workflow,
} from 'lucide-react';
import NextImage from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useIsInView } from '@/lib/use-is-in-view';
import { usePrefersReducedMotion } from '@/lib/use-prefers-reduced-motion';
import { cn } from '@/lib/utils';
import { Section } from '../section';
import SectionHeading from '../section-heading';

function MockupCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl bg-slide-bg p-6 overflow-hidden', className)}>{children}</div>
  );
}

function FeatureCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:grid lg:row-span-2 lg:grid-rows-subgrid">
      <MockupCard className="lg:min-h-[260px] xl:min-h-[320px] flex items-center justify-center">
        {children}
      </MockupCard>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-semibold text-slide-text leading-snug">{title}</h3>
        <p className="text-base leading-snug text-slide-muted">{description}</p>
      </div>
    </div>
  );
}

const BLOCK_CYCLE_MS = 2400;

type BlockPreview = {
  label: string;
  description: string;
  render: () => React.ReactNode;
};

const BLOCK_PREVIEWS: BlockPreview[] = [
  {
    label: 'Callout',
    description: 'Highlight a tip, warning, or aside inline.',
    render: () => (
      <div className="relative rounded-md bg-slide-accent/8 py-1.5 pl-3.5 pr-2">
        <span
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 left-1.5 w-[2px] rounded-full bg-slide-accent"
        />
        <div className="flex items-center gap-1 text-[10.5px] font-medium text-slide-accent">
          <Info className="size-3" />
          Tip
        </div>
        <p className="mt-1 text-[9px] leading-snug text-slide-text">
          Pin key context next to the section that needs it.
        </p>
      </div>
    ),
  },
  {
    label: 'Accordion',
    description: 'Collapsible section with a clickable summary.',
    render: () => (
      <div className="overflow-hidden rounded-md border bg-slide-bg-elevated">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <ChevronRight className="size-3 shrink-0 text-slide-muted" />
          <span className="truncate text-[11px] font-semibold text-slide-text/70">
            Click to expand
          </span>
        </div>
      </div>
    ),
  },
  {
    label: 'Tabs',
    description: 'Switch between content panes inline.',
    render: () => (
      <div className="overflow-hidden rounded-md border bg-slide-bg-elevated">
        <div className="flex border-b">
          <div className="-mb-px border-b-2 border-slide-accent px-2 py-1 text-[10px] font-semibold text-slide-text">
            Setup
          </div>
          <div className="px-2 py-1 text-[10px] text-slide-muted">Run</div>
          <div className="px-2 py-1 text-[10px] text-slide-muted">Ship</div>
        </div>
        <div className="px-2 py-1.5 text-[9px] text-slide-muted">Install deps and run init.</div>
      </div>
    ),
  },
  {
    label: 'Mermaid',
    description: 'Render flowcharts and diagrams from text.',
    render: () => {
      const NODE_FILL = 'color-mix(in srgb, var(--slide-accent) 10%, white)';
      const NODE_STROKE = 'color-mix(in srgb, var(--slide-accent) 38%, white)';
      const ARROW = 'color-mix(in srgb, var(--slide-accent) 45%, white)';
      const TEXT = 'color-mix(in srgb, var(--slide-accent) 80%, black)';
      return (
        <div className="flex items-center justify-center rounded-md border border-slide-border/50 bg-slide-bg-elevated px-2 py-2.5">
          <svg viewBox="0 0 142 26" className="w-full max-w-[150px]" aria-hidden="true">
            <title>Flowchart preview</title>
            {/* draft (rectangle) */}
            <rect x="1" y="5" width="34" height="16" rx="3" fill={NODE_FILL} stroke={NODE_STROKE} />
            <text
              x="18"
              y="13"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="7"
              fill={TEXT}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              draft
            </text>
            {/* arrow */}
            <line x1="35" y1="13" x2="48" y2="13" stroke={ARROW} />
            <polygon points="48,13 45,11 45,15" fill={ARROW} />
            {/* review (diamond) */}
            <polygon points="71,1 93,13 71,25 49,13" fill={NODE_FILL} stroke={NODE_STROKE} />
            <text
              x="71"
              y="13"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="7"
              fill={TEXT}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              review
            </text>
            {/* arrow */}
            <line x1="93" y1="13" x2="106" y2="13" stroke={ARROW} />
            <polygon points="106,13 103,11 103,15" fill={ARROW} />
            {/* ship (rectangle) */}
            <rect
              x="107"
              y="5"
              width="34"
              height="16"
              rx="3"
              fill={NODE_FILL}
              stroke={NODE_STROKE}
            />
            <text
              x="124"
              y="13"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="7"
              fill={TEXT}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              ship
            </text>
          </svg>
        </div>
      );
    },
  },
  {
    label: 'Image',
    description: 'Drop in images with captions and resize controls.',
    render: () => (
      <div className="overflow-hidden rounded-md border">
        <NextImage
          src="/images/home/block-components/image-preview.png"
          alt=""
          width={300}
          height={186}
          className="block h-auto w-full"
        />
      </div>
    ),
  },
  {
    label: 'Video',
    description: 'Embed videos with playback controls inline.',
    render: () => (
      <div className="relative overflow-hidden rounded-md border">
        <NextImage
          src="/images/home/block-components/video-preview.png"
          alt=""
          width={300}
          height={186}
          className="block h-auto w-full"
        />
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-6 items-center justify-center rounded-full bg-slide-bg-elevated/90 shadow-sm">
            <Play className="size-3 fill-slide-text text-slide-text" />
          </span>
        </span>
      </div>
    ),
  },
];

function BlockComponents() {
  const sections = [
    {
      heading: 'Components',
      items: [
        { icon: MessageSquareWarning, label: 'Callout' },
        { icon: ChevronRight, label: 'Accordion' },
        { icon: LayoutPanelTop, label: 'Tabs' },
        { icon: Workflow, label: 'Mermaid' },
      ],
    },
    {
      heading: 'Media',
      items: [
        { icon: ImageIcon, label: 'Image' },
        { icon: VideoIcon, label: 'Video' },
      ],
    },
  ];

  const [rootRef, inView] = useIsInView<HTMLDivElement>();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % BLOCK_PREVIEWS.length);
    }, BLOCK_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [inView, prefersReducedMotion]);

  const activeLabel = BLOCK_PREVIEWS[activeIdx].label;

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    const item = itemRefs.current[activeLabel];
    if (!container || !item) return;

    if (activeLabel === BLOCK_PREVIEWS[0].label) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;

    if (itemTop - visibleTop < 12) {
      container.scrollTo({ top: itemTop - 12, behavior: 'smooth' });
    } else if (itemBottom - visibleBottom > -12) {
      container.scrollTo({
        top: itemBottom - container.clientHeight + 12,
        behavior: 'smooth',
      });
    }
  }, [activeLabel]);

  return (
    <div
      ref={rootRef}
      className="flex w-full items-center justify-center [container-type:inline-size]"
    >
      <div
        className="w-[280px] flex-none [transform-origin:center_center]"
        style={{ transform: 'scale(min(1, calc(100cqw / 280px)))' }}
      >
        <div className="flex w-full items-start gap-2">
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl bg-slide-bg-elevated shadow-sm">
            <div
              ref={scrollRef}
              className="relative max-h-[150px] overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {sections.map((section) => (
                <div key={section.heading}>
                  <div className="px-2 pt-1.5 pb-1 text-[9px] font-semibold uppercase tracking-wide text-slide-muted">
                    {section.heading}
                  </div>
                  <div className="flex flex-col">
                    {section.items.map(({ icon: Icon, label }) => {
                      const active = label === activeLabel;
                      return (
                        <div
                          key={label}
                          ref={(el) => {
                            itemRefs.current[label] = el;
                          }}
                          className={cn(
                            'flex items-center gap-2 rounded-md px-2 py-1 text-[11px]',
                            active ? 'bg-slide-bg text-slide-text' : 'text-slide-muted',
                          )}
                        >
                          <Icon className="size-3 shrink-0" />
                          <span className="truncate">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1 rounded-xl bg-slide-bg-elevated p-2 shadow-sm">
            {/* Light inset card holds the active preview, centered both axes.
            Stacks all previews absolute; only the active one is opaque. */}
            <div className="relative flex min-h-[130px] items-center justify-center rounded-lg bg-slide-bg p-2.5">
              {BLOCK_PREVIEWS.map((preview, i) => (
                <div
                  key={preview.label}
                  className="absolute inset-2.5 flex items-center justify-center transition-opacity duration-300 ease-out"
                  style={{ opacity: i === activeIdx ? 1 : 0 }}
                  aria-hidden={i !== activeIdx}
                >
                  <div className="w-full">{preview.render()}</div>
                </div>
              ))}
            </div>
            <div className="relative mt-1.5 min-h-[24px]">
              {BLOCK_PREVIEWS.map((preview, i) => (
                <p
                  key={preview.label}
                  className="absolute inset-0 px-0.5 text-[9px] leading-snug text-slide-muted transition-opacity duration-300 ease-out"
                  style={{ opacity: i === activeIdx ? 1 : 0 }}
                  aria-hidden={i !== activeIdx}
                >
                  {preview.description}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const TEMPLATES = [
  { Icon: BookOpen, widths: ['w-3/4', 'w-1/2', 'w-2/3'] },
  { Icon: PenLine, widths: ['w-2/3', 'w-3/4', 'w-1/2'] },
  { Icon: Network, widths: ['w-1/2', 'w-2/3', 'w-3/5'] },
  { Icon: Compass, widths: ['w-3/5', 'w-1/2', 'w-2/3'] },
] as const;

const TEMPLATE_CYCLE_MS = 1800;

function Templates() {
  const [ref, inView] = useIsInView<HTMLDivElement>();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState(1);
  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % TEMPLATES.length);
    }, TEMPLATE_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [inView, prefersReducedMotion]);

  return (
    <div ref={ref} className="grid w-full max-w-[240px] grid-cols-2 gap-2">
      {TEMPLATES.map(({ Icon, widths }, i) => {
        const active = i === activeIndex;
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative mockup
            key={i}
            className={cn(
              'relative flex flex-col gap-2 rounded-lg bg-slide-bg-elevated p-2.5',
              'transition-[box-shadow] duration-500 ease-out',
              'opacity-0 [animation:rich-fade-up_500ms_ease-out_forwards]',
              active && 'z-10',
            )}
            style={{
              animationDelay: `${i * 80}ms`,
              boxShadow: active
                ? '0 0 0 1px color-mix(in srgb, var(--slide-accent) 50%, transparent), 0 6px 18px -6px color-mix(in srgb, var(--slide-accent) 35%, transparent), 0 2px 6px -2px rgba(15, 23, 42, 0.08)'
                : '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
            }}
          >
            <Icon
              className={cn(
                'size-3.5 transition-colors duration-500',
                active ? 'text-slide-accent' : 'text-slide-muted opacity-70',
              )}
            />
            <div className="flex flex-col gap-1">
              {widths.map((w, j) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static decorative mockup
                  key={j}
                  className={cn('h-1 rounded-full bg-slide-muted/15', w)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmbedShell({ src, children }: { src: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-[260px] flex-col items-stretch">
      <div className="flex items-center gap-2 rounded-lg bg-slide-bg-elevated px-2.5 py-2 shadow-sm">
        <Code2 className="size-3.5 shrink-0 text-slide-accent" />
        <span className="truncate font-mono text-xs text-slide-text/70">{src}</span>
      </div>
      <div className="mx-auto h-7 w-px bg-slide-border" />
      <div className="rounded-lg bg-slide-bg-elevated p-4 shadow-sm">{children}</div>
    </div>
  );
}

/* ============================================================================
 * EMBEDDABLE HTML — Stock ticker
 * Google-Finance-style single-stock featured card: symbol bold top-left,
 * company name beneath in muted, signed % change in colored top-right, big
 * mono colored price below. Live behavior: price ticks on a mean-reverting
 * random walk; each tick briefly flashes the price (accent for up, rose for
 * down) and the displayed percent re-derives from price / previousClose.
 * ========================================================================== */
type StockQuote = {
  symbol: string;
  name: string;
  price: number;
  percent: number;
};

const TICK_MS = 1400;
const TICK_MAGNITUDE = 0.08;

function useTickingPrice(base: number, magnitude: number, intervalMs: number, enabled: boolean) {
  const [price, setPrice] = useState(base);
  const prefersReducedMotion = usePrefersReducedMotion();
  useEffect(() => {
    if (!enabled) return;
    if (prefersReducedMotion) return;
    const id = window.setInterval(() => {
      setPrice((prev) => {
        const pull = (base - prev) * 0.35;
        const noise = (Math.random() - 0.5) * 2 * magnitude;
        return prev + pull + noise;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [base, magnitude, intervalMs, enabled, prefersReducedMotion]);
  return price;
}

function RollingDigit({ value }: { value: number }) {
  return (
    <span
      className="relative inline-block overflow-hidden align-baseline"
      style={{ height: '1em', width: '1ch' }}
      aria-hidden="true"
    >
      <span
        className="absolute top-0 left-0 flex flex-col"
        style={{
          transform: `translateY(-${value}em)`,
          transition: 'transform 550ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span key={d} className="block text-center" style={{ height: '1em', lineHeight: '1em' }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

function RollingPrice({ value }: { value: number }) {
  const str = value.toFixed(2);
  return (
    <>
      <span className="sr-only">${str}</span>
      <span className="inline-flex items-baseline" aria-hidden="true">
        <span>$</span>
        {str.split('').map((c, i) => {
          if (c === '.') {
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: stable position in fixed-format price string
              <span key={i}>.</span>
            );
          }
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable position in fixed-format price string
            <RollingDigit key={i} value={parseInt(c, 10)} />
          );
        })}
      </span>
    </>
  );
}

function EmbedStockTicker({ stock }: { stock: StockQuote }) {
  const [ref, inView] = useIsInView<HTMLDivElement>();
  const previousClose = stock.price / (1 + stock.percent / 100);
  const livePrice = useTickingPrice(stock.price, TICK_MAGNITUDE, TICK_MS, inView);
  const livePercent = (livePrice / previousClose - 1) * 100;

  const isGain = livePercent >= 0;
  const deltaColor = isGain ? 'text-slide-accent' : 'text-rose-600 dark:text-rose-400';
  const sign = isGain ? '+' : '−';

  return (
    <EmbedShell src='<iframe src="ticker.app" />'>
      <div ref={ref} className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col space-y-0.5">
            <span className="text-[14px] font-bold leading-tight text-slide-text">
              {stock.symbol}
            </span>
            <span className="truncate text-[10px] leading-tight text-slide-muted">
              {stock.name}
            </span>
          </div>
          <span
            className={cn(
              'shrink-0 text-[11px] font-medium leading-tight tabular-nums',
              deltaColor,
            )}
          >
            {sign}
            {Math.abs(livePercent).toFixed(2)}%
          </span>
        </div>
        <div
          className={cn(
            'font-mono text-2xl font-bold leading-none tabular-nums tracking-tight',
            deltaColor,
          )}
        >
          <RollingPrice value={livePrice} />
        </div>
      </div>
    </EmbedShell>
  );
}

const STOCK_INKP: StockQuote = {
  symbol: 'INKP',
  name: 'Inkeep, Inc.',
  price: 147.85,
  percent: 3.01,
};

function EmbeddableHtml() {
  return (
    <div className="flex w-full items-center justify-center [container-type:inline-size]">
      <div
        className="w-[260px] flex-none [transform-origin:center_center]"
        style={{ transform: 'scale(min(1, calc(100cqw / 260px)))' }}
      >
        <EmbedStockTicker stock={STOCK_INKP} />
      </div>
    </div>
  );
}

function TemplateAnimationStyles() {
  return (
    <style>{`
      @keyframes rich-fade-up {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `}</style>
  );
}

export function RichEditing() {
  return (
    <Section className="container flex flex-col gap-12 lg:gap-16">
      <TemplateAnimationStyles />
      <SectionHeading
        tag="The editor"
        description="A Notion-like editor that's just markdown under the hood."
        className="max-w-2xl"
      >
        A canvas for your knowledge.
      </SectionHeading>

      <div className="grid grid-cols-1 gap-y-12 lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:gap-x-8 lg:gap-y-5">
        <FeatureCard title="Rich elements" description="Tables, images, code, diagrams, and more.">
          <BlockComponents />
        </FeatureCard>
        <FeatureCard
          title="Embeddable HTML"
          description="Drop-in apps, previews, and visualizations."
        >
          <EmbeddableHtml />
        </FeatureCard>
        <FeatureCard title="Templates" description="Ready-made and customizable templates.">
          <Templates />
        </FeatureCard>
      </div>
    </Section>
  );
}
