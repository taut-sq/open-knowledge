import {
  Box,
  Code,
  FileText,
  Globe,
  type LucideIcon,
  MessageCircleMore,
  Sparkles,
  User,
} from 'lucide-react';

const RINGS = [20, 44, 68, 94] as const;

type Bubble = { icon: LucideIcon; angle: number; radius: number };

const BUBBLES: Bubble[] = [
  { icon: Globe, angle: 8, radius: 68 }, // right, outer ring
  { icon: User, angle: 65, radius: 44 }, // upper-right, inner ring
  { icon: FileText, angle: 128, radius: 68 }, // upper-left, outer ring
  { icon: MessageCircleMore, angle: 185, radius: 44 }, // left, inner ring
  { icon: Code, angle: 248, radius: 68 }, // lower-left, outer ring
  { icon: Box, angle: 305, radius: 44 }, // lower-right, inner ring
];

const CENTER = { x: 80, y: 45 };

function orbitMotion(radius: number) {
  return radius > 50
    ? { duration: 130, direction: 'reverse' as const }
    : { duration: 90, direction: 'normal' as const };
}

function AgentMark() {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: 44,
        height: 44,
        background:
          'linear-gradient(135deg, var(--color-purple-light) 0%, var(--color-sky-blue) 50%, var(--color-crystal-blue) 100%)',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08), 0 6px 16px -4px rgba(15, 23, 42, 0.18)',
      }}
    >
      <Sparkles className="size-[22px] text-white" strokeWidth={2} aria-hidden="true" />
    </div>
  );
}

export function AgentBrainGraphic() {
  return (
    <div className="relative h-full w-full overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes ok-orbit { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .ok-orbit-anim { animation: none !important; }
        }
      `}</style>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {RINGS.map((r) => (
          <circle
            key={r}
            cx={CENTER.x}
            cy={CENTER.y}
            r={r}
            fill="none"
            style={{ stroke: 'color-mix(in srgb, var(--slide-text) 5%, transparent)' }}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {BUBBLES.map((b, i) => {
        const Icon = b.icon;
        const { duration, direction } = orbitMotion(b.radius);
        const counterDirection = direction === 'reverse' ? 'normal' : 'reverse';
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static positions
            key={i}
            className="absolute left-1/2 top-1/2 aspect-square"
            style={{
              width: `${(b.radius / 80) * 100}%`,
              transform: `translate(-50%, -50%) rotate(${-b.angle}deg)`,
            }}
          >
            <div
              className="ok-orbit-anim h-full w-full"
              style={{ animation: `ok-orbit ${duration}s linear infinite ${direction}` }}
            >
              <div className="absolute left-full top-1/2 size-0">
                <div
                  className="ok-orbit-anim"
                  style={{ animation: `ok-orbit ${duration}s linear infinite ${counterDirection}` }}
                >
                  <div
                    className="absolute flex items-center justify-center rounded-full"
                    style={{
                      width: '40px',
                      height: '40px',
                      transform: `translate(-50%, -50%) rotate(${b.angle}deg)`,
                      background: 'color-mix(in srgb, white 45%, var(--slide-bg))',
                      border: '1px solid rgba(26, 26, 26, 0.07)',
                    }}
                  >
                    <Icon
                      className="size-[18px]"
                      strokeWidth={1.6}
                      style={{
                        color: 'color-mix(in srgb, var(--slide-text) 40%, var(--slide-bg))',
                      }}
                      aria-hidden="true"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="absolute inset-0 flex items-center justify-center">
        <AgentMark />
      </div>
    </div>
  );
}
