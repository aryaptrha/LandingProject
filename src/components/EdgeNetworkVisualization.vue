<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useEdgeStatus } from '@/composables/useEdgeStatus'
import { useLatency } from '@/composables/useLatency'
import { latencyStatusColor } from '@/utils/latency'
import { prefersReducedMotion } from '@/utils/motion'

/* The diagram reads its geography, protocol and cache verdict off the same
   `/api/edge-status` payload the status widget uses — that response is built from
   `request.cf`, so it already carries the visitor's city and country. `useVisitor`
   would return the same fields from a second poller, so it is deliberately not
   used here. Latency comes from the shared `useLatency` poll. This diagram once
   ran latency on its own slower 30s cadence "for a travel speed, not a live
   readout", but that poll is now a singleton owning a single 20s interval shared
   with the corner indicator. The trade-off is fine here: packet speed is derived
   per reading (see `hopDuration`), so a faster cadence only means the travel
   speed re-syncs to live conditions a little sooner. */
const { data } = useEdgeStatus()
const { latency, error: latencyError } = useLatency()

/** One leg of the request. `idle` is the gap between cycles. */
type Phase =
  | 'idle'
  | 'request-edge'
  | 'edge-lookup'
  | 'request-origin'
  | 'response-origin'
  | 'response-visitor'

/** Cache lookup dwell at the edge node, and the pause between cycles. */
const LOOKUP_MS = 260
const IDLE_MS = 900

/** Maps common IATA codes to friendly city/region names */
const popNameMap: Record<string, string> = {
  SIN: 'Singapore Edge',
  NRT: 'Tokyo Edge',
  HND: 'Tokyo Edge',
  KIX: 'Osaka Edge',
  ICN: 'Seoul Edge',
  HKG: 'Hong Kong Edge',
  TPE: 'Taipei Edge',
  BKK: 'Bangkok Edge',
  CGK: 'Jakarta Edge',
  SUB: 'Surabaya Edge',
  KUL: 'Kuala Lumpur Edge',
  MNL: 'Manila Edge',
  BOM: 'Mumbai Edge',
  DEL: 'Delhi Edge',
  MAA: 'Chennai Edge',
  SYD: 'Sydney Edge',
  MEL: 'Melbourne Edge',
  LAX: 'Los Angeles Edge',
  SFO: 'San Francisco Edge',
  SJC: 'San Jose Edge',
  SEA: 'Seattle Edge',
  ORD: 'Chicago Edge',
  DFW: 'Dallas Edge',
  IAD: 'Washington Edge',
  EWR: 'New Jersey Edge',
  MIA: 'Miami Edge',
  ATL: 'Atlanta Edge',
  YYZ: 'Toronto Edge',
  LHR: 'London Edge',
  CDG: 'Paris Edge',
  AMS: 'Amsterdam Edge',
  FRA: 'Frankfurt Edge',
  DUB: 'Dublin Edge',
  ARN: 'Stockholm Edge',
  WAW: 'Warsaw Edge',
  GRU: 'São Paulo Edge',
  JNB: 'Johannesburg Edge',
  DXB: 'Dubai Edge',
  DOH: 'Doha Edge',
}

/**
 * `cf-cache-status` values that mean the edge answered on its own. Everything
 * else — MISS, EXPIRED, REVALIDATED, BYPASS, DYNAMIC, NONE — reached the Worker,
 * so the second hop is real and gets animated. API routes are DYNAMIC in
 * practice, which is why the full path is the common case here.
 */
const EDGE_SERVED = new Set(['HIT', 'STALE', 'UPDATING'])

const containerRef = ref<HTMLElement | null>(null)
const revealed = ref(false)
const phase = ref<Phase>('idle')

/* Duration captured at the start of a cycle. The CSS var and the JS timers both
   read this one value, so a latency refresh mid-flight cannot leave a packet
   still travelling after its timer has already advanced the phase. */
const activeHopDuration = ref(420)

const inView = ref(false)
const pageVisible = ref(true)

let running = false
let timers: ReturnType<typeof setTimeout>[] = []
let observer: IntersectionObserver | null = null

const edgeLabel = computed(() => {
  if (!data.value?.colo || data.value.colo === 'unknown') {
    return 'Edge Node'
  }
  return popNameMap[data.value.colo] ?? `${data.value.colo} Edge`
})

/** Real visitor geography. Every `cf` field can come back as the literal string
    'unknown' (see edge.service.ts), so each part is checked before it is shown
    rather than letting "unknown, unknown" reach the label. */
const visitorLabel = computed(() => {
  const city = data.value?.city
  const code = data.value?.countryCode
  const hasCity = Boolean(city) && city !== 'unknown'
  const hasCode = Boolean(code) && code !== 'unknown'

  if (hasCity) return hasCode ? `${city}, ${code}` : (city as string)
  return hasCode ? (code as string) : 'Visitor'
})

const cacheVerdict = computed(() => {
  const status = (data.value?.cacheStatus ?? 'NONE').toUpperCase()
  return { status, servedFromEdge: EDGE_SERVED.has(status) }
})

/** Same status→colour mapping the latency indicator uses, so a green packet in
    the diagram means the same thing as a green dot in the corner widget. The
    status→colour map itself now lives in `utils/latency` (shared with the corner
    indicator and the status widget); the "no reading yet" fallback stays here
    because it is about the absence of a measurement, not about a status band. */
const latencyColor = computed(() =>
  latency.value ? latencyStatusColor(latency.value.status) : 'var(--text-medium)',
)

/**
 * Travel time for one hop, scaled from the measured round trip.
 *
 * Not literal — a 24 ms trip drawn at real speed would be a single frame. The
 * mapping is monotonic and clamped, so a slow connection visibly drags and a
 * fast one snaps, while the slowest case still stays inside a lightweight
 * motion budget rather than turning into a crawl.
 */
const hopDuration = computed(() => {
  const ms = latency.value?.ms
  if (ms == null) return 420
  return Math.round(Math.min(720, Math.max(240, 220 + ms * 2.2)))
})

/** Node currently sending, for the 1.02 scale accent. */
const activeNode = computed<'visitor' | 'edge' | 'origin' | null>(() => {
  switch (phase.value) {
    case 'request-edge':
    case 'response-visitor':
      return 'visitor'
    case 'edge-lookup':
    case 'request-origin':
      return 'edge'
    case 'response-origin':
      return 'origin'
    default:
      return null
  }
})

const hopOneMeta = computed(() => {
  const parts: string[] = []
  const protocol = data.value?.protocol
  if (protocol && protocol !== 'unknown') parts.push(protocol)

  if (latencyError.value) parts.push('unreachable')
  else if (latency.value) parts.push(`${latency.value.ms} ms`)
  else parts.push('measuring…')

  return parts.join(' · ')
})

const hopTwoMeta = computed(() =>
  cacheVerdict.value.servedFromEdge
    ? `cache ${cacheVerdict.value.status} · origin skipped`
    : `cache ${cacheVerdict.value.status}`,
)

/** One description for the whole diagram, so assistive tech gets the story
    instead of five disconnected labels. */
const flowDescription = computed(() => {
  const trip = latencyError.value
    ? 'round trip unreachable'
    : latency.value
      ? `${latency.value.ms} millisecond round trip`
      : 'round trip still being measured'

  const cache = cacheVerdict.value.servedFromEdge
    ? `Cache ${cacheVerdict.value.status}, so the edge answers without reaching the Portfolio Worker.`
    : `Cache ${cacheVerdict.value.status}, so the request continues to the Portfolio Worker and back.`

  return `Request path: ${visitorLabel.value} to ${edgeLabel.value}, ${trip}. ${cache}`
})

function clearTimers() {
  for (const timer of timers) clearTimeout(timer)
  timers = []
}

function after(ms: number, fn: () => void) {
  timers.push(setTimeout(fn, ms))
}

/**
 * Walks one request lifecycle: down to the edge, cache lookup, on to the Worker
 * and back when the edge could not answer, then the response home. The shape of
 * the cycle is decided by live cache status, so the diagram animates the path
 * this request actually took.
 */
function runCycle() {
  if (!running) return

  const hop = hopDuration.value
  activeHopDuration.value = hop

  phase.value = 'request-edge'

  after(hop, () => {
    phase.value = 'edge-lookup'

    after(LOOKUP_MS, () => {
      if (cacheVerdict.value.servedFromEdge) {
        phase.value = 'response-visitor'
        after(hop, endCycle)
        return
      }

      phase.value = 'request-origin'
      after(hop, () => {
        phase.value = 'response-origin'
        after(hop, () => {
          phase.value = 'response-visitor'
          after(hop, endCycle)
        })
      })
    })
  })
}

function endCycle() {
  phase.value = 'idle'
  after(IDLE_MS, runCycle)
}

function startAnimation() {
  if (running) return
  // The packet loop is decorative — the measurements it animates are all present
  // as text. With reduced motion requested, leave the diagram static rather than
  // running a timer chain that would burn battery for no visible benefit.
  if (prefersReducedMotion()) return

  running = true
  runCycle()
}

function stopAnimation() {
  running = false
  clearTimers()
  phase.value = 'idle'
}

function handleVisibilityChange() {
  // IntersectionObserver does not fire when the tab goes to the background: the
  // element is still intersecting, so without this the loop keeps ticking behind
  // a hidden tab.
  pageVisible.value = !document.hidden
}

watch([inView, pageVisible], ([visible, awake]) => {
  if (visible && awake) startAnimation()
  else stopAnimation()
})

onMounted(() => {
  pageVisible.value = !document.hidden
  document.addEventListener('visibilitychange', handleVisibilityChange)

  if (typeof IntersectionObserver !== 'function' || !containerRef.value) {
    // No observer to lean on — reveal and animate unconditionally rather than
    // leaving the panel faded out forever.
    revealed.value = true
    inView.value = true
    return
  }

  observer = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return
      inView.value = entry.isIntersecting
      if (entry.isIntersecting) revealed.value = true
    },
    { threshold: 0.2 },
  )

  observer.observe(containerRef.value)
})

onUnmounted(() => {
  stopAnimation()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="edge-viz"
    :class="{ 'edge-viz--revealed': revealed }"
    :style="{
      '--edge-viz-hop-duration': `${activeHopDuration}ms`,
      '--edge-viz-response': latencyColor,
    }"
  >
    <h3 class="edge-viz__title">How Cloudflare Edge Serves This Site</h3>

    <div class="edge-viz__flow" role="img" :aria-label="flowDescription">
      <!-- Visitor -->
      <div
        class="edge-viz__node edge-viz__node--visitor"
        :class="{ 'edge-viz__node--active': activeNode === 'visitor' }"
      >
        <span class="edge-viz__node-icon" aria-hidden="true">👤</span>
        <span class="edge-viz__node-label">{{ visitorLabel }}</span>
      </div>

      <!-- Visitor ↔ Edge: always travelled -->
      <div class="edge-viz__hop">
        <div class="edge-viz__track">
          <div class="edge-viz__line" />
          <span class="edge-viz__caret" aria-hidden="true">
            {{ phase === 'response-visitor' ? '↑' : '↓' }}
          </span>
          <div
            v-if="phase === 'request-edge'"
            key="request-edge"
            class="edge-viz__packet edge-viz__packet--down"
            aria-hidden="true"
          />
          <div
            v-else-if="phase === 'response-visitor'"
            key="response-visitor"
            class="edge-viz__packet edge-viz__packet--up edge-viz__packet--response"
            aria-hidden="true"
          />
        </div>
        <span class="edge-viz__hop-meta">{{ hopOneMeta }}</span>
      </div>

      <!-- Edge -->
      <div
        class="edge-viz__node edge-viz__node--edge"
        :class="{ 'edge-viz__node--active': activeNode === 'edge' }"
      >
        <span class="edge-viz__node-icon" aria-hidden="true">☁</span>
        <span class="edge-viz__node-label">{{ edgeLabel }}</span>
      </div>

      <!-- Edge ↔ Worker: dimmed when the cache answered at the edge -->
      <div
        class="edge-viz__hop"
        :class="{ 'edge-viz__hop--skipped': cacheVerdict.servedFromEdge }"
      >
        <div class="edge-viz__track">
          <div class="edge-viz__line" />
          <span class="edge-viz__caret" aria-hidden="true">
            {{ phase === 'response-origin' ? '↑' : '↓' }}
          </span>
          <div
            v-if="phase === 'request-origin'"
            key="request-origin"
            class="edge-viz__packet edge-viz__packet--down"
            aria-hidden="true"
          />
          <div
            v-else-if="phase === 'response-origin'"
            key="response-origin"
            class="edge-viz__packet edge-viz__packet--up edge-viz__packet--response"
            aria-hidden="true"
          />
        </div>
        <span class="edge-viz__hop-meta">{{ hopTwoMeta }}</span>
      </div>

      <!-- Origin Worker -->
      <div
        class="edge-viz__node edge-viz__node--portfolio"
        :class="{ 'edge-viz__node--active': activeNode === 'origin' }"
      >
        <span class="edge-viz__node-icon" aria-hidden="true">🌐</span>
        <span class="edge-viz__node-label">Portfolio Worker</span>
      </div>
    </div>

    <p class="edge-viz__note">Packet speed tracks the live round-trip time.</p>
  </div>
</template>

<style scoped>
.edge-viz {
  /* Hop geometry lives here so the keyframes can derive travel distance from it
     and the two stay in step if the height changes. */
  --edge-viz-hop-height: 52px;
  --edge-viz-packet-size: 8px;
  --edge-viz-travel: calc(var(--edge-viz-hop-height) - var(--edge-viz-packet-size));

  padding: var(--space-xl) var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  text-align: center;
  max-width: 360px;
  margin: var(--space-2xl) auto;

  /* Fade and slight lift on first scroll-in. Reduced motion collapses the
     transition to nothing via base.css, so the panel simply appears. */
  opacity: 0;
  transform: translateY(6px);
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.edge-viz--revealed {
  opacity: 1;
  transform: none;
}

.edge-viz__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-lg);
}

.edge-viz__flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.edge-viz__node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 20px;
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  background: var(--bg-soft);
  min-width: 140px;
  transition: transform 0.18s ease;
}

/* The sending node lifts by 2%. Scale only — no glow, no colour flash. */
.edge-viz__node--active {
  transform: scale(1.02);
}

.edge-viz__node--visitor {
  background: var(--blue-light);
  border-color: var(--blue-main);
}

.edge-viz__node--edge {
  background: var(--yellow-light);
  border-color: var(--yellow-main);
}

.edge-viz__node--portfolio {
  background: var(--green-light);
  border-color: var(--green-main);
}

.edge-viz__node-icon {
  font-size: 1.4rem;
}

.edge-viz__node-label {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dark);
}

/* A hop spans the full width so its track can sit dead centre under the nodes
   while the measurement label hangs off to the right. */
.edge-viz__hop {
  position: relative;
  width: 100%;
  height: var(--edge-viz-hop-height);
  transition: opacity 0.18s ease;
}

.edge-viz__hop--skipped {
  opacity: 0.45;
}

.edge-viz__hop--skipped .edge-viz__line {
  /* Dashed, because on a cache hit this leg is never travelled. */
  background: none;
  border-left: 2px dashed var(--border);
  width: 0;
}

.edge-viz__track {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 20px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.edge-viz__line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--border);
  transform: translateX(-50%);
}

.edge-viz__caret {
  position: relative;
  z-index: 1;
  font-family: 'Pixelify Sans', monospace;
  font-size: 1rem;
  line-height: 1;
  color: var(--text-medium);
}

.edge-viz__hop-meta {
  position: absolute;
  top: 50%;
  left: calc(50% + 18px);
  transform: translateY(-50%);
  white-space: nowrap;
  text-align: left;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-medium);
}

.edge-viz__packet {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 2;
  width: var(--edge-viz-packet-size);
  height: var(--edge-viz-packet-size);
  background: var(--lavender-main);
  border: 1px solid var(--text-medium);
  border-radius: 2px;
}

/* The return leg carries the latency-status colour, matching the dot in the
   corner indicator: green excellent, blue good, yellow average, pink slow. */
.edge-viz__packet--response {
  background: var(--edge-viz-response);
}

/* Travel is pure transform, so each frame composites instead of forcing the
   layout pass the old `top` animation cost. */
.edge-viz__packet--down {
  animation: edge-viz-down var(--edge-viz-hop-duration) linear both;
}

.edge-viz__packet--up {
  animation: edge-viz-up var(--edge-viz-hop-duration) linear both;
}

@keyframes edge-viz-down {
  0% {
    transform: translate(-50%, 0);
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, var(--edge-viz-travel));
    opacity: 0;
  }
}

@keyframes edge-viz-up {
  0% {
    transform: translate(-50%, var(--edge-viz-travel));
    opacity: 0;
  }
  12% {
    opacity: 1;
  }
  88% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, 0);
    opacity: 0;
  }
}

.edge-viz__note {
  margin-top: var(--space-md);
  font-size: 0.65rem;
  color: var(--text-medium);
}
</style>
