'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DOWNLOAD_URL } from '@/lib/site';
import { useIsInView } from '@/lib/use-is-in-view';
import { cn } from '@/lib/utils';
import { DotTexture } from '../dot-texture';
import { MarketingButton } from '../marketing-button';
import { Section } from '../section';
import SectionHeading from '../section-heading';

/* Two soft organic shapes drift toward center while blurring when the section
   scrolls into view, overlapping behind the headline. multiply darkens the
   overlap into a richer blue on the light background; screen is the dark-mode
   equivalent (multiply over near-black renders the shapes invisible). */
function CtaShape({
  src,
  width,
  height,
  settled,
  wrapperClassName,
  imageClassName,
  fromX,
  toX,
}: {
  src: string;
  width: number;
  height: number;
  settled: boolean;
  wrapperClassName?: string;
  imageClassName?: string;
  fromX: string;
  toX: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute left-1/2 z-0 -translate-x-1/2 -translate-y-1/2 select-none mix-blend-multiply dark:mix-blend-screen',
        wrapperClassName,
      )}
    >
      <Image
        src={src}
        alt=""
        width={width}
        height={height}
        className={cn(
          'h-auto opacity-30 transition-[transform,filter] duration-1400 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] motion-reduce:transition-none',
          imageClassName,
        )}
        style={{
          transform: `translateX(${settled ? toX : fromX})`,
          filter: settled ? 'blur(12.58px)' : 'blur(0px)',
        }}
      />
    </div>
  );
}

export function CallToAction() {
  const [stageRef, inView] = useIsInView<HTMLDivElement>('-15%');
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (inView) setSettled(true);
  }, [inView]);

  return (
    <Section className="relative overflow-hidden">
      <DotTexture variant="right" className="top-0 right-0 w-40 sm:w-72 lg:w-lg" />
      <DotTexture variant="left" className="-bottom-50 left-0 w-32 sm:w-60 lg:w-96" />

      <div
        ref={stageRef}
        className="relative flex min-h-112 items-center justify-center sm:min-h-136 lg:min-h-160"
      >
        <CtaShape
          src="/images/home/cta-shape-left.svg"
          width={606}
          height={585}
          settled={settled}
          wrapperClassName="top-1/2"
          imageClassName="w-72 sm:w-96 lg:w-[38rem]"
          fromX="-32%"
          toX="-18%"
        />
        <CtaShape
          src="/images/home/cta-shape-right.svg"
          width={700}
          height={697}
          settled={settled}
          wrapperClassName="top-[55%]"
          imageClassName="w-80 sm:w-[28rem] lg:w-[43.75rem]"
          fromX="32%"
          toX="18%"
        />

        <div className="container relative z-10 flex flex-col items-center">
          <SectionHeading tag="Get started" className="items-center" headingClassName="text-center">
            Start building knowledge.
          </SectionHeading>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
            <MarketingButton
              href={DOWNLOAD_URL}
              target="_blank"
              size="lg"
              showIcon
              iconDirection="down"
            >
              Download for macOS
            </MarketingButton>
            <Link
              href="/docs/get-started/quickstart#ok-install-web-app-linux-windows-intel-mac"
              className="font-mono text-base text-slide-muted underline-offset-4 transition-colors hover:text-slide-text hover:underline"
            >
              or CLI
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
