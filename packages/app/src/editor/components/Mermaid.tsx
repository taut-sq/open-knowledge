import { Trans, useLingui } from '@lingui/react/macro';
import type { default as PanZoomNS, PanzoomObject } from '@panzoom/panzoom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { default as MermaidNS } from 'mermaid';
import { type ComponentProps, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils.ts';
import { useJsxComponentHost } from './jsx-host-context.tsx';

interface MermaidProps {
  chart?: string;
  className?: string;
}

interface RenderState {
  status: 'idle' | 'rendering' | 'ready' | 'error';
  svg: string;
  error: string;
}

const MERMAID_ZOOM_MIN = 0.5;
const MERMAID_ZOOM_MAX = 4;
const MERMAID_ZOOM_STEP = 0.25;
const MERMAID_PAN_STEP = 48;
const buttonProps: ComponentProps<typeof Button> = {
  type: 'button',
  size: 'icon-sm',
  variant: 'secondary',
  className: 'border-border',
};

let mermaidPromise: Promise<typeof MermaidNS> | null = null;
function loadMermaid() {
  mermaidPromise ||= import('mermaid')
    .then((mod) => {
      const m = mod.default;
      m.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'default',
        suppressErrorRendering: true,
      });
      return m;
    })
    .catch((err) => {
      mermaidPromise = null;
      throw err;
    });
  return mermaidPromise;
}

let panzoomPromise: Promise<typeof PanZoomNS> | null = null;
function loadPanzoom() {
  panzoomPromise ||= import('@panzoom/panzoom')
    .then((mod) => mod.default)
    .catch((err) => {
      panzoomPromise = null;
      throw err;
    });
  return panzoomPromise;
}

const SHAPES: ReadonlyArray<{ open: string; close: string }> = [
  { open: '[[', close: ']]' },
  { open: '[(', close: ')]' },
  { open: '((', close: '))' },
  { open: '{{', close: '}}' },
  { open: '[/', close: '/]' },
  { open: '[\\', close: '\\]' },
  { open: '[/', close: '\\]' },
  { open: '[\\', close: '/]' },
  { open: '[', close: ']' },
  { open: '(', close: ')' },
  { open: '{', close: '}' },
  { open: '>', close: ']' },
];

export interface LabelMatch {
  start: number;
  end: number;
  wasQuoted: boolean;
  open: string;
  close: string;
}

export function findLabelInSource(
  source: string,
  nodeId: string,
  currentLabel: string,
): LabelMatch | null {
  for (const { open, close } of SHAPES) {
    for (const quoted of [true, false]) {
      const inner = quoted ? `"${currentLabel}"` : currentLabel;
      const fragment = `${nodeId}${open}${inner}${close}`;
      const idx = source.indexOf(fragment);
      if (idx < 0) continue;
      const prev = idx === 0 ? '' : source.charAt(idx - 1);
      if (prev && /\w/.test(prev)) continue;
      const labelStart = idx + nodeId.length + open.length;
      const labelEnd = labelStart + inner.length;
      return {
        start: labelStart,
        end: labelEnd,
        wasQuoted: quoted,
        open,
        close,
      };
    }
  }
  return null;
}

function labelNeedsQuoting(label: string): boolean {
  return /[[\](){}|;#<>&\n"]/.test(label);
}

export function spliceNewLabel(source: string, match: LabelMatch, newLabel: string): string {
  const shouldQuote = match.wasQuoted || (match.open !== '' && labelNeedsQuoting(newLabel));
  const escaped = newLabel.replace(/"/g, '#quot;');
  const replacement = shouldQuote ? `"${escaped}"` : newLabel;
  return source.slice(0, match.start) + replacement + source.slice(match.end);
}

export function extractSourceNodeId(elementId: string): string | null {
  const m = /flowchart-(.+)-\d+$/.exec(elementId);
  return m ? m[1] : null;
}

export interface EdgeInfo {
  from: string;
  to: string;
  index: number;
}

export function extractEdgeInfo(dataId: string): EdgeInfo | null {
  const m = /^L_(.+)_(\d+)$/.exec(dataId);
  if (!m) return null;
  const body = m[1];
  const index = Number(m[2]);
  const underscore = body.lastIndexOf('_');
  if (underscore < 0) return null;
  return {
    from: body.slice(0, underscore),
    to: body.slice(underscore + 1),
    index,
  };
}

export function findEdgeLabelInSource(
  source: string,
  fromId: string,
  toId: string,
  index: number,
  currentLabel: string,
): LabelMatch | null {
  const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const f = esc(fromId);
  const t = esc(toId);
  const l = esc(currentLabel);
  const arrowHead = '(?:-->|==>|-\\.->|~~~>|<--)';
  const arrowBody = '(?:--|==|-\\.|~~~)';
  const patterns: { re: RegExp; quoted: boolean; groupIndex: number }[] = [
    {
      re: new RegExp(`${f}\\s*${arrowBody}[->=]*\\s*\\|\\s*("${l}")\\s*\\|\\s*${t}`, 'gd'),
      quoted: true,
      groupIndex: 1,
    },
    {
      re: new RegExp(`${f}\\s*${arrowBody}[->=]*\\s*\\|\\s*(${l})\\s*\\|\\s*${t}`, 'gd'),
      quoted: false,
      groupIndex: 1,
    },
    {
      re: new RegExp(`${f}\\s*${arrowBody}\\s*("${l}")\\s*${arrowHead}\\s*${t}`, 'gd'),
      quoted: true,
      groupIndex: 1,
    },
    {
      re: new RegExp(`${f}\\s*${arrowBody}\\s*(${l})\\s*${arrowHead}\\s*${t}`, 'gd'),
      quoted: false,
      groupIndex: 1,
    },
  ];
  const matches: { start: number; end: number; wasQuoted: boolean }[] = [];
  for (const { re, quoted, groupIndex } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null = re.exec(source);
    while (m) {
      const groupRange = m.indices?.[groupIndex];
      if (groupRange) {
        matches.push({ start: groupRange[0], end: groupRange[1], wasQuoted: quoted });
      }
      m = re.exec(source);
    }
  }
  matches.sort((a, b) => a.start - b.start);
  const chosen = matches[index];
  if (!chosen) return null;
  return { start: chosen.start, end: chosen.end, wasQuoted: chosen.wasQuoted, open: '', close: '' };
}

export function findSequenceMessageInSource(
  source: string,
  currentMessage: string,
  occurrence = 0,
): LabelMatch | null {
  const esc = currentMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`:[ \\t]+(${esc})[ \\t]*(?=\\r?\\n|$)`, 'gmd');
  let seen = 0;
  let m: RegExpExecArray | null = re.exec(source);
  while (m) {
    if (seen === occurrence) {
      const groupRange = m.indices?.[1];
      if (!groupRange) return null;
      const [labelStart, labelEnd] = groupRange;
      return {
        start: labelStart,
        end: labelEnd,
        wasQuoted: false,
        open: '',
        close: '',
      };
    }
    seen += 1;
    m = re.exec(source);
  }
  return null;
}

export function rewriteSequenceParticipant(
  source: string,
  currentDisplay: string,
  newDisplay: string,
  occurrence = 0,
): string | null {
  const esc = currentDisplay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedNew = newDisplay.replace(/"/g, '#quot;');

  interface Match {
    range: [number, number];
    replacement: string;
  }
  const findMatch = (re: RegExp, mkReplacement: (m: RegExpExecArray) => string): Match | null => {
    let seen = 0;
    re.lastIndex = 0;
    let m = re.exec(source);
    while (m) {
      if (seen === occurrence) {
        return { range: [m.index, m.index + m[0].length], replacement: mkReplacement(m) };
      }
      seen += 1;
      m = re.exec(source);
    }
    return null;
  };

  const kw = '(?:participant|actor)';

  const rQuoted = new RegExp(`^([ \\t]*${kw}[ \\t]+\\S+[ \\t]+as[ \\t]+")${esc}(")`, 'gm');
  const mQuoted = findMatch(rQuoted, (m) => `${m[1]}${escapedNew}${m[2]}`);
  if (mQuoted)
    return source.slice(0, mQuoted.range[0]) + mQuoted.replacement + source.slice(mQuoted.range[1]);

  const rUnquoted = new RegExp(`^([ \\t]*${kw}[ \\t]+\\S+[ \\t]+as[ \\t]+)${esc}([ \\t]*)$`, 'gm');
  const mUnquoted = findMatch(rUnquoted, (m) => {
    const needsQuote = /[\s"#|;<>&]/.test(newDisplay);
    const rendered = needsQuote ? `"${escapedNew}"` : newDisplay;
    return `${m[1]}${rendered}${m[2]}`;
  });
  if (mUnquoted)
    return (
      source.slice(0, mUnquoted.range[0]) + mUnquoted.replacement + source.slice(mUnquoted.range[1])
    );

  const rBare = new RegExp(`^([ \\t]*${kw}[ \\t]+)${esc}([ \\t]*)$`, 'gm');
  const mBare = findMatch(rBare, (m) => {
    const needsQuote = /[^\w]/.test(newDisplay);
    const rendered = needsQuote ? `"${escapedNew}"` : newDisplay;
    return `${m[1]}${currentDisplay}${m[2]} as ${rendered}`;
  });
  if (mBare)
    return source.slice(0, mBare.range[0]) + mBare.replacement + source.slice(mBare.range[1]);

  return null;
}

export function MermaidView({ chart = '', className }: MermaidProps) {
  const reactId = useId();
  const renderId = `mermaid-${reactId.replaceAll(':', '_')}`;
  const [state, setState] = useState<RenderState>({ status: 'idle', svg: '', error: '' });
  const host = useJsxComponentHost();
  const canEdit = host?.editor.isEditable ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef(host);
  useLayoutEffect(() => {
    hostRef.current = host;
  }, [host]);
  const editSessionRef = useRef<{ cleanup: () => void } | null>(null);

  useEffect(() => {
    if (!chart.trim()) {
      setState({ status: 'idle', svg: '', error: '' });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'rendering' }));
    void loadPanzoom().catch(() => undefined);
    loadMermaid()
      .then(async (m) => {
        const result = await m.render(renderId, chart);
        if (!cancelled) {
          setState({ status: 'ready', svg: result.svg, error: '' });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setState({ status: 'error', svg: '', error: msg });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    if (!canEdit) return;
    const container = containerRef.current;
    if (!container) return;

    for (const label of container.querySelectorAll<HTMLElement>('.nodeLabel, .edgeLabel')) {
      label.style.cursor = 'text';
    }
    for (const label of container.querySelectorAll<SVGTextElement>(
      'text.messageText, text.actor',
    )) {
      label.style.cursor = 'text';
      label.style.pointerEvents = 'all';
    }

    function commitLabelChangeGeneric(target: EditTarget, newLabel: string): void {
      const h = hostRef.current;
      if (!h) return;
      const pos = h.getPos();
      if (typeof pos !== 'number') return;
      const node = h.editor.state.doc.nodeAt(pos);
      if (!node || node.type.name !== 'jsxComponent') return;
      const currentProps = (node.attrs.props as Record<string, unknown>) ?? {};
      const chartNow = (currentProps.chart as string) ?? '';
      let newChart: string | null = null;
      if (target.applyRewrite) {
        newChart = target.applyRewrite(chartNow, newLabel);
      } else if (target.locate) {
        const match = target.locate(chartNow);
        if (match) newChart = spliceNewLabel(chartNow, match, newLabel);
      }
      if (newChart === null) return;
      try {
        h.editor.view.dispatch(
          h.editor.state.tr.setNodeMarkup(pos, null, {
            ...node.attrs,
            props: { ...currentProps, chart: newChart },
            sourceDirty: true,
          }),
        );
      } catch (err) {
        if (!(err instanceof RangeError)) throw err;
      }
    }

    interface EditTarget {
      labelSpan: HTMLElement;
      outlineShape: SVGElement | null;
      positionAnchor?: Element;
      applyRewrite?: (chartNow: string, newLabel: string) => string | null;
      locate?: (chartNow: string) => LabelMatch | null;
    }

    function tryEnterEditWithTarget(target: EditTarget, event: MouseEvent): boolean {
      const { labelSpan, outlineShape } = target;
      const h = hostRef.current;
      if (!h) return false;
      const pos = h.getPos();
      if (typeof pos !== 'number') return false;
      const pmNode = h.editor.state.doc.nodeAt(pos);
      if (!pmNode || pmNode.type.name !== 'jsxComponent') return false;
      const currentChart = ((pmNode.attrs.props as Record<string, unknown>)?.chart as string) ?? '';
      const currentLabel = (labelSpan.textContent ?? '').trim();
      if (!currentLabel) return false;
      const rewriteHit = target.applyRewrite?.(currentChart, currentLabel);
      const locateHit = target.locate?.(currentChart);
      if (!locateHit && rewriteHit == null) return false;

      event.preventDefault();
      event.stopPropagation();

      const labelP = (labelSpan.querySelector('p') ?? labelSpan) as HTMLElement;
      const labelStyles = window.getComputedStyle(labelP);
      const svgTextColor = ((): string | null => {
        if (!(labelP instanceof SVGGraphicsElement)) return null;
        const tspan = labelP.querySelector('tspan');
        const fill = tspan
          ? window.getComputedStyle(tspan).fill
          : window.getComputedStyle(labelP).fill;
        return fill && fill !== 'none' ? fill : null;
      })();
      const inputColor = svgTextColor ?? labelStyles.color;
      const nodeShape = outlineShape;
      const nodeShapeStrokeBefore: string | null = nodeShape?.getAttribute('stroke') ?? null;
      const nodeShapeStrokeWidthBefore: string | null =
        nodeShape?.getAttribute('stroke-width') ?? null;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentLabel;
      input.setAttribute('data-mermaid-editing', 'true');
      input.setAttribute('spellcheck', 'true');
      Object.assign(input.style, {
        position: 'fixed',
        margin: '0',
        padding: '0',
        font: labelStyles.font,
        fontFeatureSettings: labelStyles.fontFeatureSettings,
        letterSpacing: labelStyles.letterSpacing,
        color: inputColor,
        textAlign: 'center',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        boxSizing: 'border-box',
        colorScheme: 'light',
        appearance: 'none',
        WebkitAppearance: 'none',
        caretColor: inputColor,
        zIndex: '2147483647',
      });
      input.style.setProperty('background', 'transparent', 'important');
      input.style.setProperty('background-color', 'transparent', 'important');
      if (nodeShape) {
        nodeShape.setAttribute('stroke', 'var(--ring, #3b82f6)');
        nodeShape.setAttribute('stroke-width', '2');
      }
      const prevLabelVisibility = labelP.style.visibility;
      labelP.style.visibility = 'hidden';

      document.body.appendChild(input);
      const anchor: Element = target.positionAnchor ?? labelP;
      function positionInput(): void {
        const r = anchor.getBoundingClientRect();
        input.style.left = `${r.left}px`;
        input.style.top = `${r.top}px`;
        input.style.width = `${r.width}px`;
        input.style.height = `${r.height}px`;
        input.style.lineHeight = `${r.height}px`;
      }
      positionInput();
      const focusRafHandle = requestAnimationFrame(() => {
        input.focus();
        input.select();
      });

      window.addEventListener('scroll', positionInput, true);
      window.addEventListener('resize', positionInput);

      let done = false;
      function cleanup(): void {
        cancelAnimationFrame(focusRafHandle);
        window.removeEventListener('scroll', positionInput, true);
        window.removeEventListener('resize', positionInput);
        input.removeEventListener('keydown', onKeyDown);
        input.removeEventListener('blur', onBlur);
        input.remove();
        labelP.style.visibility = prevLabelVisibility;
        if (nodeShape) {
          if (nodeShapeStrokeBefore === null) {
            nodeShape.removeAttribute('stroke');
          } else {
            nodeShape.setAttribute('stroke', nodeShapeStrokeBefore);
          }
          if (nodeShapeStrokeWidthBefore === null) {
            nodeShape.removeAttribute('stroke-width');
          } else {
            nodeShape.setAttribute('stroke-width', nodeShapeStrokeWidthBefore);
          }
        }
        editSessionRef.current = null;
      }
      function commit(): void {
        if (done) return;
        done = true;
        const next = input.value.trim();
        cleanup();
        if (!next || next === currentLabel) return;
        commitLabelChangeGeneric(target, next);
      }
      function discard(): void {
        if (done) return;
        done = true;
        cleanup();
      }
      function onKeyDown(ev: KeyboardEvent): void {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          ev.stopPropagation();
          discard();
          return;
        }
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          ev.stopPropagation();
          commit();
          return;
        }
        ev.stopPropagation();
      }
      function onBlur(): void {
        commit();
      }
      input.addEventListener('keydown', onKeyDown);
      input.addEventListener('blur', onBlur);
      editSessionRef.current = {
        cleanup: () => {
          if (!done) discard();
        },
      };
      return true;
    }

    function onLabelClick(event: MouseEvent): void {
      if (editSessionRef.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const nodeLabelSpan = target.closest<HTMLElement>('.nodeLabel');
      if (nodeLabelSpan) {
        const nodeGroup = target.closest<HTMLElement>('.node[id]');
        if (!nodeGroup) return;
        const nodeIdRaw = extractSourceNodeId(nodeGroup.id);
        if (!nodeIdRaw) return;
        const nodeId: string = nodeIdRaw;
        const currentLabel = (nodeLabelSpan.textContent ?? '').trim();
        if (!currentLabel) return;
        tryEnterEditWithTarget(
          {
            labelSpan: nodeLabelSpan,
            outlineShape: nodeGroup.querySelector<SVGElement>(
              'rect, polygon, path, circle, ellipse',
            ),
            locate: (chartNow) => findLabelInSource(chartNow, nodeId, currentLabel),
          },
          event,
        );
        return;
      }

      const actorText = target.closest<SVGTextElement>('text.actor');
      if (actorText) {
        const currentDisplay = (actorText.textContent ?? '').trim();
        if (!currentDisplay) return;
        const svg = actorText.ownerSVGElement;
        let occurrence = 0;
        if (svg) {
          const all = Array.from(svg.querySelectorAll<SVGTextElement>('text.actor'));
          let seen = 0;
          for (const el of all) {
            if (el === actorText) {
              occurrence = Math.floor(seen / 2);
              break;
            }
            if ((el.textContent ?? '').trim() === currentDisplay) seen += 1;
          }
        }
        const actorGroup = actorText.parentElement;
        const rectSibling =
          actorGroup?.querySelector<SVGGraphicsElement>('rect.actor') ?? actorGroup;
        tryEnterEditWithTarget(
          {
            labelSpan: actorText as unknown as HTMLElement,
            outlineShape: null,
            positionAnchor: rectSibling ?? undefined,
            applyRewrite: (chartNow, newLabel) =>
              rewriteSequenceParticipant(chartNow, currentDisplay, newLabel, occurrence),
          },
          event,
        );
        return;
      }

      const messageText = target.closest<SVGTextElement>('text.messageText');
      if (messageText) {
        const currentLabel = (messageText.textContent ?? '').trim();
        if (!currentLabel) return;
        const svg = messageText.ownerSVGElement;
        let occurrence = 0;
        if (svg) {
          const all = Array.from(svg.querySelectorAll<SVGTextElement>('text.messageText'));
          for (const el of all) {
            if (el === messageText) break;
            if ((el.textContent ?? '').trim() === currentLabel) occurrence += 1;
          }
        }
        tryEnterEditWithTarget(
          {
            labelSpan: messageText as unknown as HTMLElement,
            outlineShape: null,
            locate: (chartNow) => findSequenceMessageInSource(chartNow, currentLabel, occurrence),
          },
          event,
        );
        return;
      }

      const edgeLabelSpan = target.closest<HTMLElement>('.edgeLabel');
      if (edgeLabelSpan) {
        const labelGroup = edgeLabelSpan.closest<HTMLElement>('g[data-id^="L_"]');
        const dataId = labelGroup?.getAttribute('data-id');
        if (!dataId) return;
        const info = extractEdgeInfo(dataId);
        if (!info) return;
        const currentLabel = (edgeLabelSpan.textContent ?? '').trim();
        if (!currentLabel) return;
        tryEnterEditWithTarget(
          {
            labelSpan: edgeLabelSpan,
            outlineShape: null,
            locate: (chartNow) =>
              findEdgeLabelInSource(chartNow, info.from, info.to, info.index, currentLabel),
          },
          event,
        );
      }
    }

    function onLabelMouseDown(event: MouseEvent): void {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('.nodeLabel, .edgeLabel, text.messageText, text.actor')) return;
      event.stopPropagation();
    }
    function onLabelClickCapture(event: MouseEvent): void {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (!t.closest('.nodeLabel, .edgeLabel, text.messageText, text.actor')) return;
      event.stopPropagation();
      onLabelClick(event);
    }

    container.addEventListener('mousedown', onLabelMouseDown, { capture: true });
    container.addEventListener('click', onLabelClickCapture, { capture: true });
    return () => {
      container.removeEventListener('mousedown', onLabelMouseDown, { capture: true });
      container.removeEventListener('click', onLabelClickCapture, { capture: true });
      editSessionRef.current?.cleanup();
      editSessionRef.current = null;
    };
  }, [state.status, canEdit]);

  if (!chart.trim()) {
    return (
      <div className="mermaid mermaid-placeholder" data-component-type="mermaid">
        <span className="mermaid-empty"> </span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mermaid mermaid-error" data-component-type="mermaid" title={state.error}>
        <div
          role="alert"
          className="mermaid-error-message mb-2 flex items-start gap-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
        >
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <div className="font-medium">
              <Trans>Mermaid diagram failed to render.</Trans>
            </div>
            <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] opacity-90">
              {state.error}
            </pre>
          </div>
        </div>
        {/* The chart source shows WHAT the author wrote so they can locate
            the offending line/column the parser message refers to. */}
        <pre className="mermaid-error-source">{chart}</pre>
      </div>
    );
  }

  if (state.status === 'ready') {
    return (
      <div
        ref={containerRef}
        className={cn(
          'mermaid mermaid-ready flex h-full min-h-64 w-full overflow-hidden rounded-md border border-border/60 bg-background',
          className,
        )}
        data-component-type="mermaid"
      >
        <MermaidInteractiveView svg={state.svg} />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid mermaid-${state.status}`}
      data-component-type="mermaid"
    />
  );
}

function MermaidInteractiveView({ svg }: { svg: string }) {
  const { t } = useLingui();
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);
  const labels = {
    zoomIn: t`Zoom in`,
    zoomOut: t`Zoom out`,
    reset: t`Reset view`,
    panUp: t`Pan up`,
    panDown: t`Pan down`,
    panLeft: t`Pan left`,
    panRight: t`Pan right`,
    toolbar: t`Mermaid diagram controls`,
  } as const;

  useEffect(() => {
    if (!svg.trim()) return;
    const svgElement = svgHostRef.current?.querySelector<SVGElement>('svg');
    if (svgElement?.namespaceURI !== 'http://www.w3.org/2000/svg') return;

    let disposed = false;
    let panzoom: PanzoomObject | null = null;

    loadPanzoom()
      .then((Panzoom) => {
        if (disposed) return;

        panzoom = Panzoom(svgElement, {
          canvas: true,
          cursor: 'default',
          maxScale: MERMAID_ZOOM_MAX,
          minScale: MERMAID_ZOOM_MIN,
          noBind: true,
          step: MERMAID_ZOOM_STEP,
          touchAction: 'auto',
        });
        panzoomRef.current = panzoom;
      })
      .catch((err) => {
        console.warn('[Mermaid] panzoom setup failed:', err);
        if (panzoomRef.current === panzoom) {
          panzoomRef.current = null;
        }
      });

    return () => {
      disposed = true;
      if (panzoomRef.current === panzoom) {
        panzoomRef.current = null;
      }
      panzoom?.destroy();
    };
  }, [svg]);

  const panBy = (x: number, y: number) => {
    panzoomRef.current?.pan(x, y, { relative: true });
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 overflow-hidden bg-muted/20"
      contentEditable={false}
    >
      <div
        ref={svgHostRef}
        className="ok-mermaid-svg flex min-h-0 flex-1 items-center justify-center [&>svg]:size-full [&>svg]:select-none"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid.render with securityLevel:'strict' returns a sanitized SVG string with no script execution; this is the documented integration path.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div
        className="absolute right-3 bottom-3 grid grid-cols-3 gap-1"
        data-testid="mermaid-actions"
        role="toolbar"
        aria-label={labels.toolbar}
      >
        <span aria-hidden="true" />
        <Button
          {...buttonProps}
          title={labels.panUp}
          aria-label={labels.panUp}
          onClick={() => panBy(0, -MERMAID_PAN_STEP)}
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </Button>
        <Button
          {...buttonProps}
          title={labels.zoomIn}
          aria-label={labels.zoomIn}
          onClick={() => panzoomRef.current?.zoomIn()}
        >
          <ZoomIn className="size-4" aria-hidden="true" />
        </Button>
        <Button
          {...buttonProps}
          title={labels.panLeft}
          aria-label={labels.panLeft}
          onClick={() => panBy(-MERMAID_PAN_STEP, 0)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Button>
        <Button
          {...buttonProps}
          title={labels.reset}
          aria-label={labels.reset}
          onClick={() => panzoomRef.current?.reset()}
        >
          <RefreshCcw className="size-4" aria-hidden="true" />
        </Button>
        <Button
          {...buttonProps}
          title={labels.panRight}
          aria-label={labels.panRight}
          onClick={() => panBy(MERMAID_PAN_STEP, 0)}
        >
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
        <span aria-hidden="true" />
        <Button
          {...buttonProps}
          title={labels.panDown}
          aria-label={labels.panDown}
          onClick={() => panBy(0, MERMAID_PAN_STEP)}
        >
          <ArrowDown className="size-4" aria-hidden="true" />
        </Button>
        <Button
          {...buttonProps}
          title={labels.zoomOut}
          aria-label={labels.zoomOut}
          onClick={() => panzoomRef.current?.zoomOut()}
        >
          <ZoomOut className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
