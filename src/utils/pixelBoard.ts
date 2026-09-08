/**
 * Pure board helpers for the shared pixel canvas: the palette, index arithmetic, and
 * unpacking the wire format.
 *
 * No Vue, no fetch, no DOM state — the same shape as `utils/latency.ts`. The socket
 * lifecycle and everything reactive lives in `composables/usePixelCanvas.ts`; this file
 * is the part that can be reasoned about without a running connection.
 *
 * ## Why these constants are duplicated from the worker
 *
 * `src/worker/types/canvas.ts` declares the same numbers, and this file cannot import
 * them: `tsconfig.app.json` excludes `src/worker/**` so that DOM-typed and
 * workers-typed code never share a compilation. Duplication is the deliberate cost of
 * that separation.
 *
 * The duplication is made safe rather than merely documented. `GET /api/canvas` serves
 * `width`, `height` and `paletteSize` with every snapshot, and `usePixelCanvas` treats
 * the served values as authoritative for indexing — so a worker deployed with a
 * different board size than the bundle expects renders correctly instead of tearing.
 * The values below are what the client assumes before it has heard from the edge.
 */

/** Board width in cells. Must match `BOARD_WIDTH` in the worker. */
export const BOARD_WIDTH = 64
/** Board height in cells. Must match `BOARD_HEIGHT` in the worker. */
export const BOARD_HEIGHT = 64
/** Total cells, and the length of an unpacked board. */
export const BOARD_CELLS = BOARD_WIDTH * BOARD_HEIGHT
/** Palette index meaning "never painted". Rendered as the board's own background. */
export const EMPTY_CELL = 0

/** One paintable colour, named by the design token it renders as. */
export interface PaletteEntry {
  /** CSS custom property, resolved at runtime so the cell follows the active theme. */
  token: string
  /** Accessible name for the swatch button. Never the only signal — see the component. */
  label: string
}

/**
 * The palette, and the reason the board cannot go off-brand.
 *
 * Cells store an **index into this table**, never a colour. Two things follow, and both
 * are the point:
 *
 * 1. Every token below has a dark-theme override in `base.css`, so existing artwork
 *    re-colours when a visitor flips the theme. Storing hex would freeze a drawing to
 *    whichever theme its author happened to be using.
 * 2. `design.md`'s "flat colours only" and "too many colours becomes visual noise"
 *    rules hold by construction. There is no moderation queue for a palette that
 *    cannot express anything off-palette.
 *
 * Index 0 is empty and unpaintable, which is why the swatch list skips it. The rest is
 * the site's own ramp: four hues in two shades, one deeper blue, and three neutrals for
 * outlines — pixel art needs a dark edge more than it needs a fifth hue.
 *
 * **Length is a contract.** `PALETTE_SIZE` in the worker must equal this array's length,
 * because the worker validates `0 <= color < PALETTE_SIZE` and holds no other opinion
 * about what a colour means. Adding an entry means changing both, and appending only —
 * inserting in the middle would silently recolour every pixel already on the board.
 */
export const PALETTE: readonly PaletteEntry[] = [
  { token: '--bg-soft', label: 'Empty' },
  { token: '--blue-light', label: 'Light blue' },
  { token: '--blue-main', label: 'Blue' },
  { token: '--blue-deep', label: 'Deep blue' },
  { token: '--green-light', label: 'Light green' },
  { token: '--green-main', label: 'Green' },
  { token: '--pink-light', label: 'Light pink' },
  { token: '--pink-main', label: 'Pink' },
  { token: '--yellow-light', label: 'Light yellow' },
  { token: '--yellow-main', label: 'Yellow' },
  { token: '--border', label: 'Light grey' },
  { token: '--text-medium', label: 'Grey' },
  { token: '--text-dark', label: 'Ink' },
]

/** Number of entries, including the unpaintable empty cell at index 0. */
export const PALETTE_SIZE = PALETTE.length

/**
 * Resolves every palette token to a concrete colour for the active theme.
 *
 * Read once per paint pass rather than per cell: `getComputedStyle` forces style
 * resolution, and calling it 4096 times to draw 4096 squares would make a theme flip
 * visibly janky. Callers re-run this when the theme changes and redraw from the same
 * board bytes — that is the whole mechanism by which stored artwork follows the theme.
 *
 * Falls back to a mid grey per entry. A palette that silently resolved to empty strings
 * would paint nothing and look like a broken socket rather than a missing stylesheet.
 */
export function resolvePalette(root: HTMLElement): string[] {
  const style = getComputedStyle(root)
  return PALETTE.map((entry) => style.getPropertyValue(entry.token).trim() || '#888888')
}

/** Cell index to grid coordinates, row-major. */
export function idxToXY(idx: number, width = BOARD_WIDTH): { x: number; y: number } {
  return { x: idx % width, y: Math.floor(idx / width) }
}

/** Grid coordinates to cell index, row-major. Callers clamp before calling. */
export function xyToIdx(x: number, y: number, width = BOARD_WIDTH): number {
  return y * width + x
}

/** Clamps a value into `[0, max]`, used to keep the keyboard caret on the board. */
export function clampCell(value: number, max: number): number {
  return value < 0 ? 0 : value > max ? max : value
}

/**
 * Decodes the base64 board the worker sends in its snapshot.
 *
 * One byte per cell, so the whole 64×64 board is 4096 bytes and ~5.5 KB as base64 — a
 * single message, no chunking, no per-cell query.
 *
 * Returns `null` rather than throwing on anything malformed. A snapshot that will not
 * decode is a bug worth surfacing as "could not load the board", and the caller can
 * present that; it is not worth an exception escaping a socket message handler, where
 * it would take the connection down with it.
 */
export function unpackBoard(base64: string, expectedCells = BOARD_CELLS): Uint8Array | null {
  try {
    const binary = atob(base64)
    if (binary.length !== expectedCells) return null

    const board = new Uint8Array(expectedCells)
    for (let i = 0; i < expectedCells; i += 1) {
      board[i] = binary.charCodeAt(i)
    }
    return board
  } catch {
    return null
  }
}
