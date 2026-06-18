import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { getInitialTerminalHeight, writeTerminalHeight } from '@/lib/terminal-height-store';
import { cn } from '@/lib/utils';
import type { TerminalLaunchIntent } from './EditorPane';
import { TerminalGate } from './TerminalGate';

const TERMINAL_PANEL_ID = 'terminal-dock-panel';

interface TerminalDockProps {
  readonly bridge: OkDesktopBridge;
  readonly children: ReactNode;
  readonly visible: boolean;
  readonly onVisibleChange: (visible: boolean) => void;
  readonly launch?: TerminalLaunchIntent | null;
}

export function TerminalDock({
  bridge,
  children,
  visible,
  onVisibleChange,
  launch = null,
}: TerminalDockProps) {
  const panelRef = usePanelRef();
  const editorRegionRef = useRef<HTMLDivElement | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(!visible);
  const [mounted, setMounted] = useState(visible);

  const [initialHeightPx] = useState(() => getInitialTerminalHeight());
  const heightPxRef = useRef(initialHeightPx);

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function debouncedWriteHeight(px: number) {
    if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      writeTerminalHeight(px);
      writeTimerRef.current = null;
    }, 100);
  }
  const dragUpHandlerRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      if (writeTimerRef.current != null) clearTimeout(writeTimerRef.current);
      if (dragUpHandlerRef.current != null) {
        window.removeEventListener('pointerup', dragUpHandlerRef.current);
        dragUpHandlerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  function killTerminal() {
    setMounted(false);
    onVisibleChange(false);
    editorRegionRef.current?.focus();
  }

  const killTerminalRef = useRef(killTerminal);
  useEffect(() => {
    killTerminalRef.current = killTerminal;
  });

  useEffect(() => {
    return bridge.onMenuAction((action) => {
      if (action === 'kill-terminal') killTerminalRef.current();
    });
  }, [bridge]);

  useEffect(() => {
    bridge.editor.notifyViewMenuStateChanged({ terminalLive: mounted });
  }, [bridge, mounted]);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel == null) return;
    if (visible) {
      panel.resize(`${heightPxRef.current}px`);
    } else {
      panel.collapse();
    }
  }, [visible, panelRef]);

  useLayoutEffect(() => {
    if (!isCollapsed) return;
    const panelEl = document.getElementById(TERMINAL_PANEL_ID);
    if (!panelEl?.contains(document.activeElement)) return;
    editorRegionRef.current?.focus();
  }, [isCollapsed]);

  useLayoutEffect(() => {
    if (isCollapsed) return;
    const panelEl = document.getElementById(TERMINAL_PANEL_ID);
    panelEl?.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus();
  }, [isCollapsed]);

  return (
    <ResizablePanelGroup
      orientation="vertical"
      className="min-h-0 flex-1"
      data-dragging={isDragging || undefined}
    >
      <ResizablePanel minSize="20%" className="flex min-h-0 flex-col">
        {/* tabIndex -1 makes this a programmatic focus target for focus-return
            on collapse without adding it to the tab order. */}
        <div
          ref={editorRegionRef}
          tabIndex={-1}
          className="flex h-full min-h-0 flex-col outline-none"
        >
          {children}
        </div>
      </ResizablePanel>
      <ResizableHandle
        withHandle
        onPointerDown={() => {
          setIsDragging(true);
          isDraggingRef.current = true;
          const handleUp = () => {
            setIsDragging(false);
            isDraggingRef.current = false;
            window.removeEventListener('pointerup', handleUp);
            dragUpHandlerRef.current = null;
          };
          dragUpHandlerRef.current = handleUp;
          window.addEventListener('pointerup', handleUp);
        }}
      />
      <ResizablePanel
        id={TERMINAL_PANEL_ID}
        panelRef={panelRef}
        defaultSize={visible ? `${initialHeightPx}px` : 0}
        minSize="120px"
        maxSize="50%"
        collapsible
        collapsedSize={0}
        onResize={(size) => {
          const collapsed = size.asPercentage === 0;
          setIsCollapsed(collapsed);
          if (isDraggingRef.current) {
            if (collapsed && visible) onVisibleChange(false);
            else if (!collapsed && !visible) onVisibleChange(true);
            if (size.inPixels > 0) {
              heightPxRef.current = size.inPixels;
              debouncedWriteHeight(size.inPixels);
            }
          }
        }}
        inert={isCollapsed}
        className={cn(
          'flex flex-col',
          !isDragging &&
            'transition-[flex-grow] duration-150 ease-out motion-reduce:transition-none motion-reduce:duration-0',
        )}
      >
        {mounted ? (
          <TerminalGate
            bridge={bridge}
            launch={launch}
            onClose={() => {
              onVisibleChange(false);
              editorRegionRef.current?.focus();
            }}
            onKill={killTerminal}
          />
        ) : null}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
