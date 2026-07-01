export type WheelButton = 64 | 65;

export interface WheelReportOptions {
  readonly cellHeight: number;
  readonly sensitivity: number;
  readonly maxRowsPerEvent: number;
  readonly viewportRows: number;
}

export interface WheelReportResult {
  readonly count: number;
  readonly button: WheelButton;
  readonly accumulator: number;
}

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

export function nextWheelReports(
  deltaY: number,
  deltaMode: number,
  accumulator: number,
  opts: WheelReportOptions,
): WheelReportResult {
  const rows =
    deltaMode === DOM_DELTA_LINE
      ? deltaY
      : deltaMode === DOM_DELTA_PAGE
        ? deltaY * opts.viewportRows
        : deltaY / opts.cellHeight; // DOM_DELTA_PIXEL (and any unknown mode)

  const next = accumulator + rows * opts.sensitivity;
  const whole = Math.trunc(next);
  if (whole === 0) {
    return { count: 0, button: 65, accumulator: next };
  }
  return {
    count: Math.min(Math.abs(whole), opts.maxRowsPerEvent),
    button: whole < 0 ? 64 : 65,
    accumulator: next - whole,
  };
}

/** 1-based coordinates carried by an SGR wheel report — cells for SGR (1006),
 *  CSS px for SGR_PIXELS (1016). */
export interface WheelReportPosition {
  readonly x: number;
  readonly y: number;
}

/** Cell-width stand-in when the renderer hasn't measured yet; used to compute
 *  the pixel-encoding viewport extent (clamp bound and center fallback). */
const FALLBACK_CELL_WIDTH = 9;

export function wheelReportPosition(
  offsetX: number | undefined,
  offsetY: number | undefined,
  opts: {
    readonly cellWidth: number | undefined;
    readonly cellHeight: number;
    readonly cols: number;
    readonly rows: number;
    readonly pixels: boolean;
  },
): WheelReportPosition {
  const cellWidth = opts.cellWidth !== undefined && opts.cellWidth > 0 ? opts.cellWidth : undefined;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 1), max);
  if (opts.pixels) {
    const maxX = Math.round((cellWidth ?? FALLBACK_CELL_WIDTH) * opts.cols);
    const maxY = Math.round(opts.cellHeight * opts.rows);
    return {
      x: isFiniteNumber(offsetX) ? clamp(Math.floor(offsetX) + 1, maxX) : Math.ceil(maxX / 2),
      y: isFiniteNumber(offsetY) ? clamp(Math.floor(offsetY) + 1, maxY) : Math.ceil(maxY / 2),
    };
  }
  return {
    x:
      isFiniteNumber(offsetX) && cellWidth !== undefined
        ? clamp(Math.floor(offsetX / cellWidth) + 1, opts.cols)
        : Math.ceil(opts.cols / 2),
    y: isFiniteNumber(offsetY)
      ? clamp(Math.floor(offsetY / opts.cellHeight) + 1, opts.rows)
      : Math.ceil(opts.rows / 2),
  };
}

function isFiniteNumber(v: number | undefined): v is number {
  return v !== undefined && Number.isFinite(v);
}

/** SGR-encoded wheel report at the given 1-based position. The position must
 *  track the pointer (or fall back to viewport center): hit-testing TUIs
 *  scroll the component under the reported cell, and a constant corner
 *  position lands outside every scrollable region. */
export function sgrWheelReport(button: WheelButton, position: WheelReportPosition): string {
  return `\x1b[<${button};${position.x};${position.y}M`;
}
