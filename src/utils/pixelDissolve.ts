import type { RevealOrigin } from './reveal'

/**
 * Pixel dissolve: the frames of a wavefront spreading outward from a point,
 * quantised to a square grid.
 *
 * Pure — no Vue, no DOM, no measurement. Given an origin and a viewport size it
 * returns a list of `clip-path` strings, each covering a little more of the screen
 * than the last. `reveal.ts` hands them to the incoming view-transition
 * snapshot, which is then uncovered block by block.
 *
 * ## Why frames, and not one shape that grows
 *
 * A dissolve is not a shape that grows. It is a set of cells that individually flip
 * on, in an order that is mostly-but-not-quite radial — there is no pair of paths a
 * browser could tween to produce it. So this animation is deliberately *discrete*:
 * `path()` values whose segment counts differ cannot interpolate, and the Web
 * Animations spec falls back to discrete stepping for exactly that case. That
 * fallback is the mechanism here, not an obstacle being worked around.
 *
 * ## Where the easing lives
 *
 * Not in a progress curve. A discrete animation uses its easing only to decide *when*
 * to flip between keyframes, and here every frame is one flip, so an `easing` on the
 * animation would just reshuffle which frame lands when — it cannot smooth anything
 * the frames do not already contain. The easing therefore has to be built into the
 * schedule itself: `RADIAL_EXPONENT` decides how fast the wavefront travels, and
 * `normalise` decides where it starts and stops.
 *
 * Both were fitted by measuring the result rather than reasoned about, because the
 * first two attempts here were wrong in ways that are invisible on paper. A plain
 * distance schedule under an ease-in-out curve spent the first 100ms and the last
 * 130ms of a 500ms dissolve showing nothing change at all — the flat start of the
 * curve compounding with the flat start of a disc's area growth. What the frames
 * needed was not more easing but less.
 *
 * ## Why blocks
 *
 * design.md builds this site out of pixel art on a fixed grid, down to forbidding
 * fractional sprite translation. A dissolve made of grid-aligned squares is the same
 * visual language as the icons.
 *
 * It also has to be *different* from the theme toggle's smooth circular wipe. Both
 * controls sit within a few hundred pixels of each other and both re-make the whole
 * page; if they shared one gesture, two quite different actions would feel like the
 * same action. The circle stays with the palette, where its softness suits a re-skin.
 * The view switch changes what the page *is*, and gets the harder edge.
 */

/**
 * Roughly how many blocks span the viewport's width, before clamping.
 *
 * The block *count* is held near-constant across viewports rather than the block
 * *size*, so the effect reads the same on a phone as on an ultrawide instead of being
 * fine grain on one and sliding panels on the other. It also bounds the work: cell
 * count stays near `TARGET_COLS x (TARGET_COLS / aspect)` whatever the screen.
 */
const TARGET_COLS = 44

/**
 * Block size floor and ceiling, in CSS px. Below ~20 the blocks stop reading as
 * pixels and start reading as noise; past ~64 they read as tiles.
 */
const MIN_BLOCK = 20
const MAX_BLOCK = 64

/**
 * How long the dissolve runs, in ms. Lives here rather than beside the circle's
 * duration because `FRAME_COUNT` is chosen against it — the two are one decision.
 *
 * 500ms is well past design.md's 200ms ceiling, and past the 300ms the circular
 * reveal already documents as an exception. The reasoning is the same but stronger:
 * that ceiling governs *feedback*, where the eye is on the element and the travel is
 * a few pixels. This is a whole-viewport change made of ~1400 individually timed
 * cells, and a cell cannot register as a cell unless it is on screen for more than a
 * frame or two. Much under 400ms the blocks stop being legible as blocks and the
 * whole thing collapses back into the hard cut it exists to replace.
 */
export const DISSOLVE_MS = 500

/**
 * Frames across the whole dissolve. 30 over 500ms is one flip every 16.7ms, so the
 * stepping lands on a 60Hz display's own cadence instead of beating against it. More
 * frames buys nothing — nothing can flip faster than the screen refreshes.
 */
const FRAME_COUNT = 30

/**
 * How much of a cell's reveal time comes from noise rather than from its distance to
 * the origin, 0..1.
 *
 * At 0 this is a hard-edged circle rendered in blocks: clean, but mechanical, and
 * close enough to the theme toggle's circle to defeat the point. At 1 it is static
 * with no sense of direction or origin at all. 0.38 keeps the wavefront obviously
 * travelling outward from the pressed segment while leaving its edge ragged enough to
 * look scattered by hand.
 */
const JITTER = 0.38

/**
 * The curve the wavefront's radius follows, as an exponent on normalised distance.
 *
 * A cell's schedule entry is a *time*, so the exponent works in reverse: at exponent
 * n the revealed radius grows as `progress^(1/n)`, which decelerates. That matters
 * because area, not radius, is what the eye reads as speed — a ring travelling at
 * constant radial speed uncovers ever more screen per frame and reads as accelerating
 * into a rush at the end.
 *
 * In an unbounded plane the exponent that makes area grow evenly would be exactly 2,
 * since area goes as r-squared. The viewport clips the disc long before it is done,
 * so the honest figure is lower, and 1.6 is where measured coverage came out straight
 * across phone, laptop and ultrawide alike. Fitted, not derived.
 */
const RADIAL_EXPONENT = 1.6

/**
 * Where the schedule is cut off at the top, as a quantile.
 *
 * Normalising against the outright maximum stretches the timeline to fit one unlucky
 * cell — the far corner that also drew a high jitter — and leaves the last several
 * frames at 99% coverage, visibly stalled, waiting for a handful of blocks. Cutting
 * at the 99th percentile and clamping puts that last one percent on the final frame
 * instead, where it reads as the dissolve completing rather than as it hesitating.
 *
 * The clamp is not optional: without it those above-cutoff cells would never satisfy
 * `revealAt <= 1` and the finished dissolve would keep permanent holes in it.
 */
const SCHEDULE_CUTOFF = 0.99

/**
 * Deterministic pseudo-random in [0, 1) from a pair of small integers — the standard
 * shader hash. Deterministic matters: the same press produces the same dissolve, so a
 * visitor toggling back and forth sees one effect rather than a fresh scatter each
 * time.
 */
function hash01(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** One grid-aligned rectangle as an SVG subpath. */
function rect(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}h${w}v${h}h${-w}Z`
}

/**
 * Rescales a schedule in place so the first cell reveals at 0 and the cutoff quantile
 * reveals at 1 — the step that makes the dissolve start on the first frame and finish
 * on the last, rather than somewhere inside them.
 *
 * The bottom end is as important as the top. Raw entries never reach 0, because even
 * the cell under the origin carries its share of jitter, so without this the first
 * several frames are empty and the press appears not to have registered.
 */
function normalise(schedule: Float32Array): void {
  const sorted = schedule.slice().sort()
  const lo = sorted[0] ?? 0
  const hi = sorted[Math.floor((sorted.length - 1) * SCHEDULE_CUTOFF)] ?? 1
  // A single-cell grid, or a degenerate viewport where every distance is 0.
  const span = hi - lo || 1

  for (let i = 0; i < schedule.length; i += 1) {
    schedule[i] = Math.min(1, ((schedule[i] ?? 0) - lo) / span)
  }
}

/**
 * The revealed cells at `progress`, as a single `clip-path` value.
 *
 * Horizontal runs are merged into one rectangle each rather than emitted per cell.
 * Mid-dissolve the core around the origin is solid, so this collapses hundreds of
 * squares into a handful of rectangles per row and keeps each frame's string small.
 * The shape is identical either way, since adjacent cells share an edge.
 */
function pathFor(
  schedule: Float32Array,
  cols: number,
  rows: number,
  block: number,
  progress: number,
): string {
  let subpaths = ''

  for (let row = 0; row < rows; row += 1) {
    let runStart = -1

    // One index past the end closes a run still open at the right edge, so the loop
    // needs no epilogue.
    for (let col = 0; col <= cols; col += 1) {
      const revealAt = col < cols ? schedule[row * cols + col] : undefined
      const on = revealAt !== undefined && revealAt <= progress

      if (on && runStart < 0) {
        runStart = col
      } else if (!on && runStart >= 0) {
        subpaths += rect(runStart * block, row * block, (col - runStart) * block, block)
        runStart = -1
      }
    }
  }

  // `path("")` is invalid CSS, and an empty frame is reachable — a viewport with no
  // cells at all. A zero-area subpath is the valid way to say "clip everything away",
  // which leaves the outgoing snapshot underneath as all that shows.
  return subpaths === '' ? 'path("M0 0Z")' : `path("${subpaths}")`
}

/**
 * Builds the whole dissolve up front, in one pass, as `FRAME_COUNT` `clip-path` values
 * ready to hand to `Element.animate()`.
 *
 * Up front rather than per frame from a `requestAnimationFrame` loop, which was the
 * obvious alternative. Two reasons. A real animation is what holds a view transition
 * open — the browser tears the snapshots down as soon as its pseudo-elements stop
 * animating, so a hand-driven loop would need a dummy animation running alongside it
 * purely to keep them alive. And generating strings inside the frame budget of an
 * animation that is already compositing two full-page snapshots is the wrong place to
 * spend time. The cost is around 35kB of transient strings, once per press.
 */
export function buildDissolveFrames(
  origin: RevealOrigin,
  width: number,
  height: number,
): string[] {
  const block = Math.min(MAX_BLOCK, Math.max(MIN_BLOCK, Math.round(width / TARGET_COLS)))
  const cols = Math.max(1, Math.ceil(width / block))
  const rows = Math.max(1, Math.ceil(height / block))

  // Distances are normalised against the furthest viewport corner so the exponent
  // below works on a 0..1 range whatever the screen size. `|| 1` covers the degenerate
  // zero-sized viewport, where every distance is already 0.
  const maxDistance =
    Math.max(
      Math.hypot(origin.x, origin.y),
      Math.hypot(width - origin.x, origin.y),
      Math.hypot(origin.x, height - origin.y),
      Math.hypot(width - origin.x, height - origin.y),
    ) || 1

  // Reveal time per cell, 0..1, row-major. Computed once and shared by every frame —
  // that is what makes the wavefront coherent rather than re-scattered each frame.
  const schedule = new Float32Array(cols * rows)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const dx = col * block + block / 2 - origin.x
      const dy = row * block + block / 2 - origin.y
      const distance = Math.hypot(dx, dy) / maxDistance
      schedule[row * cols + col] =
        Math.pow(distance, RADIAL_EXPONENT) * (1 - JITTER) + hash01(col, row) * JITTER
    }
  }
  normalise(schedule)

  // Linear, because `normalise` and `RADIAL_EXPONENT` have already shaped the curve;
  // see "Where the easing lives" above. `FRAME_COUNT - 1` makes the last frame land on
  // exactly 1, which is what guarantees full coverage given the clamp in `normalise`.
  const frames: string[] = []
  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    frames.push(pathFor(schedule, cols, rows, block, frame / (FRAME_COUNT - 1)))
  }
  return frames
}
