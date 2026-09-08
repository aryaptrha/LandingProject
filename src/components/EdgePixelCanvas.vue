<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePixelCanvas } from '../composables/usePixelCanvas'
import { useSiteConfig } from '../composables/useSiteConfig'
import { useTheme } from '../composables/useTheme'
import { prefersReducedMotion } from '../utils/motion'
import { clampCell, idxToXY, resolvePalette, xyToIdx } from '../utils/pixelBoard'
import PixelPalette from './canvas/PixelPalette.vue'
import PresenceRow from './canvas/PresenceRow.vue'

/**
 * The shared pixel canvas: a 64×64 board every visitor paints on, live.
 *
 * Orchestrator, per the `components/chat/` split — the socket is
 * `usePixelCanvas`, the swatches are `PixelPalette`, the readout is `PresenceRow`, and
 * what is left here is the board itself: sizing, drawing, and the two input methods.
 */

const {
  board,
  boardVersion,
  status,
  presence,
  readOnly,
  remaining,
  dailyQuota,
  cooldownMs,
  lastReject,
  width,
  height,
  place,
} = usePixelCanvas()
const { config } = useSiteConfig()
const { isNight } = useTheme()

/** Hidden entirely when switched off in KV, the same way `EdgeInsights` hides. */
const isDisabled = computed(() => config.value.canvasEnabled === false)
const configNotice = computed(() => config.value.canvasNotice)

const stage = ref<HTMLElement | null>(null)
const boardCanvas = ref<HTMLCanvasElement | null>(null)
const caretCanvas = ref<HTMLCanvasElement | null>(null)

const selected = ref(2)
const caret = ref({ x: 0, y: 0 })
/** Caret position and placement results, for screen readers. Throttled — see below. */
const announcement = ref('')

/** Cooldown in seconds, for the hint line. */
const cooldownSeconds = computed(() => (cooldownMs.value / 1000).toFixed(1))

/**
 * Resolved colours for the active theme, index-aligned with `PALETTE`.
 *
 * Reactive rather than a plain `let` because the swatch row renders from it — a theme
 * flip has to re-colour the palette as well as the board, and those are the same array.
 */
const paletteColors = ref<string[]>([])
/**
 * What is currently on the canvas.
 *
 * Kept so a board change can be *diffed* rather than announced. The composable reports
 * "something changed" as one counter, which is right for it — it should not have to know
 * how the pixels are drawn — and this is the cheap way to recover which cells moved: a
 * 4096-byte compare, well under the cost of the redraw it saves.
 */
let drawn = new Uint8Array(0)
/** Cells mid-fade: index to the colour underneath, the colour arriving, and when. */
const fading = new Map<number, { from: number; to: number; start: number }>()
let fadeFrame = 0
/** Device pixels per cell. Always a positive integer — that is the whole point. */
let cellScale = 8

let resizeObserver: ResizeObserver | null = null
let announceTimer: ReturnType<typeof setTimeout> | null = null

const FADE_MS = 150
/**
 * Above this many changed cells, draw immediately instead of fading.
 *
 * A snapshot replaces hundreds of cells at once; a placement changes one. Fading a whole
 * snapshot would be a 150 ms wash over the entire board on every reconnect, which reads
 * as a glitch rather than as an arrival.
 */
const FADE_MAX_CELLS = 32

// --- Sizing -----------------------------------------------------------------

/**
 * Snaps the board to a whole number of device pixels per cell.
 *
 * This is the crispness rule from `design.md`, applied to the one element on the site
 * where it is arithmetic rather than judgement. The backing store is 64×64, one texel
 * per cell, and CSS scales it up with `image-rendering: pixelated` — nearest-neighbour.
 * If the scale factor is fractional, nearest-neighbour distributes the remainder
 * unevenly and some cells come out a pixel wider than their neighbours. On a grid of
 * flat pastels that reads as a seam running through the artwork.
 *
 * So: floor to an integer multiple of the cell count in *device* pixels, then convert
 * back to CSS pixels for the style. `dpr` is in the middle of that on purpose — a 1.5×
 * or 2× display is where the fractional case actually shows up.
 */
function resize(): void {
  const el = stage.value
  const canvas = boardCanvas.value
  const overlay = caretCanvas.value
  if (!el || !canvas || !overlay) return

  const cells = width.value
  const available = el.clientWidth
  if (available <= 0) return

  const dpr = window.devicePixelRatio || 1
  // At least 1 device pixel per cell, or a narrow phone would compute a zero-width
  // board and render nothing at all.
  cellScale = Math.max(1, Math.floor((available * dpr) / cells))
  const cssSize = (cells * cellScale) / dpr

  canvas.width = cells
  canvas.height = height.value
  canvas.style.width = `${cssSize}px`
  canvas.style.height = `${(height.value * cellScale) / dpr}px`

  // The caret is UI chrome rather than board art, so its overlay runs at full device
  // resolution — a ring drawn into a 64×64 buffer would be one texel thick and blur to
  // mush on the way up.
  overlay.width = cells * cellScale
  overlay.height = height.value * cellScale
  overlay.style.width = canvas.style.width
  overlay.style.height = canvas.style.height

  drawAll()
  drawCaret()
}

// --- Drawing ----------------------------------------------------------------

function colorFor(index: number): string {
  return paletteColors.value[index] ?? '#888888'
}

/** Repaints every cell. Used on resize, on a snapshot, and on a theme change. */
function drawAll(): void {
  const canvas = boardCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  const cells = board.value
  const w = width.value
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < cells.length; i += 1) {
    const value = cells[i] ?? 0
    ctx.fillStyle = colorFor(value)
    ctx.fillRect(i % w, Math.floor(i / w), 1, 1)
  }

  if (drawn.length !== cells.length) drawn = new Uint8Array(cells.length)
  drawn.set(cells)
}

/** Draws one cell at full opacity. */
function drawCell(idx: number, value: number): void {
  const ctx = boardCanvas.value?.getContext('2d')
  if (!ctx) return
  const { x, y } = idxToXY(idx, width.value)
  ctx.globalAlpha = 1
  ctx.fillStyle = colorFor(value)
  ctx.fillRect(x, y, 1, 1)
}

/**
 * Advances every in-flight fade by one frame.
 *
 * Opacity only, never scale: these are single cells on a 64-grid, and a scaled cell is
 * either sub-pixel or overlapping its neighbour. `design.md` allows a 1.00->1.02 scale on
 * cards, not on grid art.
 */
function stepFades(): void {
  const ctx = boardCanvas.value?.getContext('2d')
  if (!ctx) {
    fading.clear()
    fadeFrame = 0
    return
  }

  const now = performance.now()
  const w = width.value

  for (const [idx, fade] of fading) {
    const t = Math.min(1, (now - fade.start) / FADE_MS)
    const { x, y } = idxToXY(idx, w)

    // The old colour goes down first so the new one has something to blend against —
    // without it a fade over an empty cell would blend against whatever the canvas was
    // cleared to, which is transparent rather than the board's background.
    ctx.globalAlpha = 1
    ctx.fillStyle = colorFor(fade.from)
    ctx.fillRect(x, y, 1, 1)

    ctx.globalAlpha = t
    ctx.fillStyle = colorFor(fade.to)
    ctx.fillRect(x, y, 1, 1)

    if (t >= 1) fading.delete(idx)
  }
  ctx.globalAlpha = 1

  fadeFrame = fading.size > 0 ? requestAnimationFrame(stepFades) : 0
}

/**
 * Applies whatever changed since the last draw.
 *
 * The diff is what lets one code path serve both a single placement and a whole
 * snapshot: below the threshold every changed cell fades in, above it the board is
 * simply redrawn.
 */
function applyChanges(): void {
  const cells = board.value
  if (drawn.length !== cells.length) {
    drawAll()
    return
  }

  const changed: number[] = []
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i] !== drawn[i]) {
      changed.push(i)
      if (changed.length > FADE_MAX_CELLS) break
    }
  }

  if (changed.length === 0) return
  if (changed.length > FADE_MAX_CELLS || prefersReducedMotion()) {
    // Reduced motion takes the immediate path rather than a shortened one. A 150 ms
    // fade is not a duration to tune down here — the global neutraliser in `base.css`
    // cannot reach inside a canvas, so this guard is the only thing honouring the
    // preference for these pixels.
    for (const idx of changed) drawCell(idx, cells[idx] ?? 0)
    if (changed.length > FADE_MAX_CELLS) drawAll()
    drawn.set(cells)
    return
  }

  const now = performance.now()
  for (const idx of changed) {
    const to = cells[idx] ?? 0
    // A cell re-painted mid-fade keeps its original `from`, so the blend stays anchored
    // to the last colour actually confirmed on screen rather than to a half-faded one.
    const existing = fading.get(idx)
    fading.set(idx, { from: existing?.from ?? drawn[idx] ?? 0, to, start: now })
  }
  drawn.set(cells)

  if (!fadeFrame) fadeFrame = requestAnimationFrame(stepFades)
}

/** Draws the keyboard caret on the overlay, in device pixels so it stays crisp. */
function drawCaret(): void {
  const overlay = caretCanvas.value
  const ctx = overlay?.getContext('2d')
  if (!overlay || !ctx) return

  ctx.clearRect(0, 0, overlay.width, overlay.height)
  if (!hasFocus.value) return

  const lineWidth = Math.max(1, Math.round(cellScale / 4))
  const x = caret.value.x * cellScale
  const y = caret.value.y * cellScale

  // Two rings, light over dark, so the caret is visible on every palette entry. A single
  // ring in one colour disappears against the swatch nearest to it, and `design.md`
  // requires focus to be visible rather than usually visible.
  ctx.lineWidth = lineWidth
  ctx.strokeStyle = '#000000'
  ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, cellScale - lineWidth, cellScale - lineWidth)
  ctx.strokeStyle = '#FFFFFF'
  ctx.strokeRect(
    x + lineWidth * 1.5,
    y + lineWidth * 1.5,
    cellScale - lineWidth * 3,
    cellScale - lineWidth * 3,
  )
}

// --- Input ------------------------------------------------------------------

const hasFocus = ref(false)

/**
 * Announces at most once every 400 ms.
 *
 * Holding an arrow key fires a move per repeat, and an unthrottled live region would
 * queue every one of them — a screen reader then reads a stream of coordinates long
 * after the caret has stopped. Announcing the *latest* position on a trailing timer says
 * the one thing the listener wants.
 */
function announce(message: string): void {
  if (announceTimer) return
  announcement.value = message
  announceTimer = setTimeout(() => {
    announceTimer = null
  }, 400)
}

function cellFromPointer(event: PointerEvent): number | null {
  const canvas = boardCanvas.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null

  const x = Math.floor(((event.clientX - rect.left) / rect.width) * width.value)
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * height.value)
  if (x < 0 || y < 0 || x >= width.value || y >= height.value) return null
  return xyToIdx(x, y, width.value)
}

function onPointerDown(event: PointerEvent): void {
  // Primary button / single touch only. A right-click or a two-finger gesture is a
  // context menu or a scroll, not a placement.
  if (event.button !== 0) return
  const idx = cellFromPointer(event)
  if (idx === null) return

  caret.value = idxToXY(idx, width.value)
  drawCaret()
  void place(idx, selected.value)
}

function onKeydown(event: KeyboardEvent): void {
  const maxX = width.value - 1
  const maxY = height.value - 1
  const { x, y } = caret.value
  let next = { x, y }

  switch (event.key) {
    case 'ArrowLeft':
      next = { x: clampCell(x - 1, maxX), y }
      break
    case 'ArrowRight':
      next = { x: clampCell(x + 1, maxX), y }
      break
    case 'ArrowUp':
      next = { x, y: clampCell(y - 1, maxY) }
      break
    case 'ArrowDown':
      next = { x, y: clampCell(y + 1, maxY) }
      break
    case 'Home':
      next = { x: 0, y }
      break
    case 'End':
      next = { x: maxX, y }
      break
    case 'Enter':
    case ' ':
      // Space would scroll the page, and the caret is the thing the visitor is aiming.
      event.preventDefault()
      void place(xyToIdx(x, y, width.value), selected.value)
      announce(`Piksel ditaruh di kolom ${x + 1}, baris ${y + 1}.`)
      return
    default:
      return
  }

  // Arrow keys scroll too, and a board that scrolls the page out from under the caret
  // is unusable by keyboard.
  event.preventDefault()
  caret.value = next
  drawCaret()
  announce(`Kolom ${next.x + 1}, baris ${next.y + 1}.`)
}

// --- Lifecycle --------------------------------------------------------------

watch(boardVersion, applyChanges)

watch([width, height], resize)

/*
 * A theme flip re-resolves the palette and repaints from the same bytes.
 *
 * This is the payoff for storing a palette index per cell instead of a colour: existing
 * artwork follows the theme instead of being frozen to whichever one its author used.
 */
watch(isNight, () => {
  const root = document.documentElement
  paletteColors.value = resolvePalette(root)
  drawAll()
})

onMounted(() => {
  paletteColors.value = resolvePalette(document.documentElement)
  resize()

  if (typeof ResizeObserver !== 'undefined' && stage.value) {
    resizeObserver = new ResizeObserver(() => resize())
    resizeObserver.observe(stage.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (fadeFrame) cancelAnimationFrame(fadeFrame)
  if (announceTimer) clearTimeout(announceTimer)
})
</script>

<template>
  <section v-if="!isDisabled" class="canvas" aria-labelledby="canvas-title">
    <header class="canvas__header">
      <div>
        <h2 id="canvas-title" class="canvas__title">🎨 Pixel Canvas</h2>
        <p class="canvas__subtitle">
          Satu papan 64×64 buat semua pengunjung, disimpan di Durable Object dan
          disiarkan lewat WebSocket.
        </p>
      </div>
    </header>

    <p v-if="configNotice" class="canvas__notice">{{ configNotice }}</p>

    <PresenceRow
      :status="status"
      :presence="presence"
      :remaining="remaining"
      :daily-quota="dailyQuota"
    />

    <div ref="stage" class="canvas__stage">
      <!--
        One focusable control rather than 4096. A cell at this zoom is around 8px, well
        under `design.md`'s 44px minimum, so pointer input cannot be the only way in —
        the caret plus arrow keys is what makes the board reachable, and the swatches
        below are the part that actually meets 44px.
      -->
      <div
        class="canvas__frame"
        tabindex="0"
        :aria-label="`Papan piksel bersama, ${width} kali ${height} sel. Panah untuk pindah, Enter untuk menaruh piksel.`"
        aria-describedby="canvas-hint"
        @focus="hasFocus = true; drawCaret()"
        @blur="hasFocus = false; drawCaret()"
        @keydown="onKeydown"
        @pointerdown="onPointerDown"
      >
        <canvas ref="boardCanvas" class="canvas__board"></canvas>
        <canvas ref="caretCanvas" class="canvas__caret" aria-hidden="true"></canvas>
      </div>
    </div>

    <p id="canvas-hint" class="canvas__hint">
      Klik atau pakai panah lalu Enter. Satu piksel per {{ cooldownSeconds }} detik.
    </p>

    <!-- role="alert" rather than the polite region: a rejection is the answer to
         something the visitor just did, and it explains a pixel that vanished from under
         their cursor. The worker phrases it, so the copy stays in one place. -->
    <p v-if="lastReject" class="canvas__reject" role="alert">{{ lastReject }}</p>

    <PixelPalette
      :colors="paletteColors"
      :selected="selected"
      :disabled="readOnly || status === 'offline'"
      @select="selected = $event"
    />

    <!-- Separate from PresenceRow's `role="status"`: that one reports connection state,
         this one reports what the visitor just did. Merging them would make every caret
         move re-announce the viewer count. -->
    <p class="canvas__sr-only" aria-live="polite">{{ announcement }}</p>
  </section>
</template>

<style scoped>
.canvas {
  padding: var(--space-lg);
  /* Glass is allowed here — `design.md` permits it on cards and panels, and forbids it
     on the swatches inside. */
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  font-family: 'Nunito', sans-serif;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.canvas__title {
  margin: 0;
  font-family: 'Pixelify Sans', cursive;
  font-size: 1.25rem;
  color: var(--text-dark);
}

.canvas__subtitle {
  margin: var(--space-xs) 0 0;
  font-size: 0.85rem;
  color: var(--text-medium);
}

.canvas__notice {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--yellow-light);
  border: 2px solid var(--yellow-main);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--text-dark);
}

.canvas__stage {
  display: flex;
  justify-content: center;
}

.canvas__frame {
  position: relative;
  line-height: 0;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  /* The board is drawn edge to edge, so the radius has to clip it or the corners spill
     square over a rounded frame. */
  overflow: hidden;
  cursor: crosshair;
}

.canvas__frame:focus-visible {
  outline: 2px solid var(--text-dark);
  outline-offset: 2px;
}

.canvas__board,
.canvas__caret {
  display: block;
  /*
   * Nearest-neighbour upscaling, which is the entire rendering strategy: a 64×64 backing
   * store blown up by an integer factor. `resize()` guarantees that factor is a whole
   * number of device pixels, and the two together are what keep every cell exactly the
   * same width.
   */
  image-rendering: pixelated;
}

.canvas__caret {
  position: absolute;
  inset: 0;
  /* Chrome over art: the caret must not eat the click meant for the cell under it. */
  pointer-events: none;
}

.canvas__reject {
  margin: 0;
  padding: var(--space-sm) var(--space-md);
  background: var(--pink-light);
  border: 2px solid var(--pink-main);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  color: var(--text-dark);
}

.canvas__hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-medium);
  font-variant-numeric: tabular-nums;
}

.canvas__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
