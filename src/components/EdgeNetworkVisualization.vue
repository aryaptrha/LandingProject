<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useEdgeStatus } from '@/composables/useEdgeStatus'
import { useLatency } from '@/composables/useLatency'
import { latencyStatusColor, latencyStatusLabel } from '@/utils/latency'
import { prefersReducedMotion } from '@/utils/motion'

const { data, isLoading: edgeLoading, refresh: refreshEdge } = useEdgeStatus()
const { latency, measure: refreshLatency } = useLatency()

/** Flow scenarios representing featured tech in this frontend & Cloudflare edge */
type FlowScenario = 'delivery' | 'turnstile' | 'chat' | 'telemetry'

const activeFlow = ref<FlowScenario>('delivery')
const selectedTechId = ref<string | null>(null)

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

const containerRef = ref<HTMLElement | null>(null)
const revealed = ref(false)
const activeHopIndex = ref(0)
const inView = ref(false)
const pageVisible = ref(true)

let running = false
let animInterval: ReturnType<typeof setInterval> | null = null
let observer: IntersectionObserver | null = null

const edgeLabel = computed(() => {
  if (!data.value?.colo || data.value.colo === 'unknown') {
    return 'Global Anycast POP'
  }
  return popNameMap[data.value.colo] ?? `${data.value.colo} Edge`
})

const coloCode = computed(() => {
  if (!data.value?.colo || data.value.colo === 'unknown') return 'EDGE'
  return data.value.colo
})

const latencyColor = computed(() =>
  latency.value ? latencyStatusColor(latency.value.status) : 'var(--text-medium)',
)

const latencyLabel = computed(() =>
  latency.value ? latencyStatusLabel(latency.value.status) : '—',
)

interface TechFeature {
  id: string
  name: string
  badge: string
  role: string
  description: string
  color: string
  bgLight: string
  category: 'compute' | 'security' | 'storage' | 'ai' | 'cdn'
}

const techFeatures: TechFeature[] = [
  {
    id: 'workers',
    name: 'Cloudflare Workers',
    badge: 'Compute Engine',
    role: 'Serverless Edge Runtime (V8 Isolates)',
    description:
      'Runs the backend Hono API, executes routing, telemetry handlers, and proxies requests with sub-millisecond cold starts globally.',
    color: 'var(--blue-main)',
    bgLight: 'var(--blue-light)',
    category: 'compute',
  },
  {
    id: 'turnstile',
    name: 'Cloudflare Turnstile',
    badge: 'Bot Protection',
    role: 'Smart CAPTCHA / Bot Defense',
    description:
      'Protects the Edge Guestbook form against spam and bots using cryptographic token challenges verified server-side with /siteverify.',
    color: 'var(--yellow-main)',
    bgLight: 'var(--yellow-light)',
    category: 'security',
  },
  {
    id: 'chat',
    name: 'AI Persona Chat',
    badge: 'AI Proxy & SSE',
    role: 'Conversational Edge Assistant',
    description:
      'Proxies conversational AI queries through Cloudflare Workers with streaming responses, context memory, and custom pixel avatars.',
    color: 'var(--lavender-main)',
    bgLight: 'var(--lavender-light)',
    category: 'ai',
  },
  {
    id: 'd1',
    name: 'Cloudflare D1 (SQL)',
    badge: 'Relational DB',
    role: 'Serverless SQLite Database',
    description:
      'Provides persistent, low-latency relational storage at the edge for visitor guestbook messages and analytics visit records.',
    color: 'var(--green-main)',
    bgLight: 'var(--green-light)',
    category: 'storage',
  },
  {
    id: 'kv',
    name: 'Cloudflare KV Store',
    badge: 'Fast Key-Value',
    role: 'Global Distributed Cache & Config',
    description:
      'Ultra-fast global key-value store powering read caches, rate-limiting counters, and runtime feature toggles without redeploys.',
    color: 'var(--pink-main)',
    bgLight: 'var(--pink-light)',
    category: 'storage',
  },
  {
    id: 'assets',
    name: 'Cloudflare ASSETS / CDN',
    badge: 'Edge Hosting',
    role: 'Static Asset Delivery & Caching',
    description:
      'Delivers the compiled Vue 3 Single Page Application from 300+ global edge data centers with automatic HTTP/3 and TLS 1.3 optimization.',
    color: 'var(--blue-main)',
    bgLight: 'var(--blue-light)',
    category: 'cdn',
  },
]

interface FlowStep {
  fromNode: string
  toNode: string
  action: string
  protocol: string
  techBadge: string
}

interface ScenarioConfig {
  id: FlowScenario
  title: string
  shortLabel: string
  icon: string
  description: string
  steps: FlowStep[]
  activeNodes: string[]
}

const scenarios: Record<FlowScenario, ScenarioConfig> = {
  delivery: {
    id: 'delivery',
    title: 'Static App Delivery & Caching',
    shortLabel: 'App Delivery',
    icon: '📦',
    description:
      'Browser requests the Vue 3 SPA bundle. Cloudflare Anycast terminates TLS 1.3 / HTTP/3 and serves static files directly from the edge cache.',
    activeNodes: ['client', 'edge-pop', 'assets-cdn'],
    steps: [
      {
        fromNode: 'client',
        toNode: 'edge-pop',
        action: 'TLS 1.3 / HTTP/3 Handshake & GET /',
        protocol: 'HTTP/3 + TLS 1.3',
        techBadge: 'Anycast DNS',
      },
      {
        fromNode: 'edge-pop',
        toNode: 'assets-cdn',
        action: 'Lookup static bundle in Cloudflare ASSETS',
        protocol: 'Internal Edge Bus',
        techBadge: 'CF Cache / ASSETS',
      },
      {
        fromNode: 'assets-cdn',
        toNode: 'client',
        action: 'Serve cached SPA bundle (HTML / CSS / JS)',
        protocol: 'HTTP/3 Cache HIT',
        techBadge: '300+ Edge POPs',
      },
    ],
  },
  turnstile: {
    id: 'turnstile',
    title: 'Turnstile Bot Defense & D1 Storage',
    shortLabel: 'Bot Protection & Guestbook',
    icon: '🛡️',
    description:
      'When submitting a guestbook message, Turnstile issues a cryptographic challenge. The Worker verifies the token before persisting to D1 and updating KV cache.',
    activeNodes: ['client', 'turnstile-svc', 'workers-api', 'd1-db', 'kv-cache'],
    steps: [
      {
        fromNode: 'client',
        toNode: 'turnstile-svc',
        action: 'Client acquires interactive Turnstile verification token',
        protocol: 'Crypto Challenge',
        techBadge: 'Turnstile Widget',
      },
      {
        fromNode: 'client',
        toNode: 'workers-api',
        action: 'POST /api/guestbook with message & Turnstile token',
        protocol: 'HTTPS REST API',
        techBadge: 'Hono Worker',
      },
      {
        fromNode: 'workers-api',
        toNode: 'turnstile-svc',
        action: 'Backend validation via challenges.cloudflare.com/siteverify',
        protocol: 'Server Siteverify',
        techBadge: 'Bot Defense',
      },
      {
        fromNode: 'workers-api',
        toNode: 'd1-db',
        action: 'Execute SQL statement: INSERT INTO guestbook',
        protocol: 'D1 SQL Engine',
        techBadge: 'Cloudflare D1',
      },
      {
        fromNode: 'workers-api',
        toNode: 'kv-cache',
        action: 'Invalidate & refresh recent guestbook list in KV',
        protocol: 'KV Write',
        techBadge: 'Cloudflare KV',
      },
      {
        fromNode: 'workers-api',
        toNode: 'client',
        action: 'Return 201 Created & update real-time feed',
        protocol: 'JSON Response',
        techBadge: 'Client State Sync',
      },
    ],
  },
  chat: {
    id: 'chat',
    title: 'AI Persona Chat Edge Proxy',
    shortLabel: 'AI Chat Assistant',
    icon: '🤖',
    description:
      'Chat queries are processed through Cloudflare Worker edge routes, streaming responses from the Arya persona engine back to the frontend.',
    activeNodes: ['client', 'workers-api', 'chat-proxy'],
    steps: [
      {
        fromNode: 'client',
        toNode: 'workers-api',
        action: 'POST /api/chat with user prompt & conversation context',
        protocol: 'HTTP/3 JSON / SSE',
        techBadge: 'Vue 3 Composable',
      },
      {
        fromNode: 'workers-api',
        toNode: 'chat-proxy',
        action: 'Worker proxies request to Arya AI backend engine',
        protocol: 'Secure Upstream Proxy',
        techBadge: 'Worker Isolate',
      },
      {
        fromNode: 'chat-proxy',
        toNode: 'workers-api',
        action: 'Generate persona response with custom prompt headers',
        protocol: 'AI Completion Stream',
        techBadge: 'Persona Engine',
      },
      {
        fromNode: 'workers-api',
        toNode: 'client',
        action: 'Stream generated reply & persist to local storage',
        protocol: 'Encrypted Stream',
        techBadge: 'Client Storage Sync',
      },
    ],
  },
  telemetry: {
    id: 'telemetry',
    title: 'Edge Telemetry & Analytics Pipeline',
    shortLabel: 'Live Telemetry & Logs',
    icon: '⚡',
    description:
      'Cloudflare Edge extracts request telemetry (Colo POP, Ray ID, TLS, Protocol) on incoming visits, logging aggregates into D1 and caching them in KV.',
    activeNodes: ['client', 'edge-pop', 'workers-api', 'd1-db', 'kv-cache'],
    steps: [
      {
        fromNode: 'client',
        toNode: 'edge-pop',
        action: 'Edge inspects request.cf object (Colo, TLS, Protocol, Ray ID)',
        protocol: 'HTTP/3 Edge Ingress',
        techBadge: 'Anycast Network',
      },
      {
        fromNode: 'edge-pop',
        toNode: 'workers-api',
        action: 'Worker service extracts telemetry & calculates RTT',
        protocol: 'Internal Binding',
        techBadge: 'edge.service.ts',
      },
      {
        fromNode: 'workers-api',
        toNode: 'd1-db',
        action: 'Async visit recording: INSERT INTO visits',
        protocol: 'D1 Batch Write',
        techBadge: 'Cloudflare D1',
      },
      {
        fromNode: 'workers-api',
        toNode: 'kv-cache',
        action: 'Serve cached 24h visit analytics aggregate',
        protocol: 'KV Read (Hit)',
        techBadge: 'KV Cache Read',
      },
      {
        fromNode: 'workers-api',
        toNode: 'client',
        action: 'Return live edge status JSON & real-time latency',
        protocol: 'JSON Telemetry',
        techBadge: 'useEdgeStatus',
      },
    ],
  },
}

const fallbackStep: FlowStep = {
  fromNode: 'client',
  toNode: 'edge-pop',
  action: 'Processing request at Cloudflare Edge',
  protocol: 'HTTP/3',
  techBadge: 'Anycast Edge',
}

const currentScenario = computed(() => scenarios[activeFlow.value])
const totalSteps = computed(() => currentScenario.value.steps.length)
const currentStep = computed<FlowStep>(() => {
  const step = currentScenario.value.steps[activeHopIndex.value]
  if (step) return step
  const first = currentScenario.value.steps[0]
  return first ?? fallbackStep
})

function setFlow(flow: FlowScenario) {
  activeFlow.value = flow
  activeHopIndex.value = 0
}

function selectTech(id: string) {
  selectedTechId.value = selectedTechId.value === id ? null : id
}

function nextStep() {
  activeHopIndex.value = (activeHopIndex.value + 1) % totalSteps.value
}

function startAnimation() {
  if (running) return
  if (prefersReducedMotion()) return
  running = true
  if (animInterval) clearInterval(animInterval)
  animInterval = setInterval(() => {
    nextStep()
  }, 2200)
}

function stopAnimation() {
  running = false
  if (animInterval) {
    clearInterval(animInterval)
    animInterval = null
  }
}

function handleVisibilityChange() {
  pageVisible.value = !document.hidden
}

watch([inView, pageVisible], ([visible, awake]) => {
  if (visible && awake) startAnimation()
  else stopAnimation()
})

watch(activeFlow, () => {
  activeHopIndex.value = 0
})

onMounted(() => {
  pageVisible.value = !document.hidden
  document.addEventListener('visibilitychange', handleVisibilityChange)

  if (typeof IntersectionObserver !== 'function' || !containerRef.value) {
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
    { threshold: 0.15 },
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
  <section
    ref="containerRef"
    class="edge-tech-viz"
    :class="{ 'edge-tech-viz--revealed': revealed }"
    aria-labelledby="edge-tech-title"
  >
    <!-- Header -->
    <header class="edge-tech-viz__header">
      <div class="edge-tech-viz__title-group">
        <div class="edge-tech-viz__title-row">
          <span class="edge-tech-viz__pixel-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
              <path d="M4 14H2V10H4V8H8V6H14V8H18V10H22V14H20V16H18V18H6V16H4V14Z" fill="var(--blue-main)" />
              <path d="M7 10H9V12H7V10Z" fill="var(--surface)" />
              <path d="M15 10H17V12H15V10Z" fill="var(--surface)" />
              <path d="M11 12H13V15H11V12Z" fill="var(--yellow-main)" />
            </svg>
          </span>
          <h2 id="edge-tech-title" class="edge-tech-viz__title">Cloudflare Edge & Architecture Visualizer</h2>
        </div>
        <p class="edge-tech-viz__subtitle">
          Interactive full-stack map of the Cloudflare technologies and frontend features powering this application.
        </p>
      </div>

      <!-- Live Edge Telemetry Strip -->
      <div class="edge-tech-viz__live-strip">
        <div class="live-tag" title="Nearest Cloudflare Edge Point of Presence">
          <span class="live-tag__dot" style="background: var(--status-online);" />
          <span class="live-tag__label">POP:</span>
          <span class="live-tag__value">{{ coloCode }} ({{ edgeLabel }})</span>
        </div>

        <div class="live-tag" title="Transport Layer Protocol & Encryption">
          <span class="live-tag__label">Protocol:</span>
          <span class="live-tag__value">{{ data?.protocol ?? 'HTTP/3' }} · {{ data?.tlsVersion ?? 'TLSv1.3' }}</span>
        </div>

        <div class="live-tag" title="Measured Round Trip Latency">
          <span class="live-tag__dot" :style="{ background: latencyColor }" />
          <span class="live-tag__label">RTT:</span>
          <span class="live-tag__value">{{ latency ? `${latency.ms} ms (${latencyLabel})` : 'measuring…' }}</span>
        </div>
      </div>
    </header>

    <!-- Interactive Scenario Switcher -->
    <div class="edge-tech-viz__tabs-wrapper">
      <div class="edge-tech-viz__tabs-label">Featured Request Flow:</div>
      <div class="edge-tech-viz__tabs" role="tablist" aria-label="Cloudflare Technology Flows">
        <button
          v-for="scenario in scenarios"
          :key="scenario.id"
          type="button"
          role="tab"
          :aria-selected="activeFlow === scenario.id"
          class="flow-tab-btn"
          :class="{ 'flow-tab-btn--active': activeFlow === scenario.id }"
          @click="setFlow(scenario.id)"
        >
          <span class="flow-tab-btn__icon" aria-hidden="true">{{ scenario.icon }}</span>
          <span class="flow-tab-btn__label">{{ scenario.shortLabel }}</span>
        </button>
      </div>
    </div>

    <!-- Active Scenario Description Banner -->
    <div class="scenario-banner">
      <div class="scenario-banner__header">
        <span class="scenario-banner__title">{{ currentScenario.title }}</span>
        <span class="scenario-banner__step-counter">
          Step {{ activeHopIndex + 1 }} of {{ totalSteps }}
        </span>
      </div>
      <p class="scenario-banner__text">{{ currentScenario.description }}</p>
    </div>

    <!-- Architectural Pipeline Visualization -->
    <div class="arch-canvas" role="region" aria-label="Architecture Diagram">
      <div class="arch-canvas__tiers">
        <!-- Tier 1: Client Layer -->
        <div class="arch-tier arch-tier--client">
          <div class="arch-tier__header">
            <span class="arch-tier__badge">Client Layer</span>
            <span class="arch-tier__title">Browser / Frontend</span>
          </div>

          <div
            class="arch-node arch-node--client"
            :class="{
              'arch-node--active': currentScenario.activeNodes.includes('client'),
              'arch-node--highlight': currentStep.fromNode === 'client' || currentStep.toNode === 'client',
            }"
          >
            <div class="arch-node__icon">
              <!-- Pixel Monitor / Client SVG -->
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                <rect x="2" y="3" width="20" height="14" rx="2" fill="var(--blue-light)" stroke="var(--blue-main)" stroke-width="2" />
                <rect x="5" y="6" width="14" height="8" fill="var(--surface)" />
                <path d="M10 17H14V20H10V17Z" fill="var(--text-medium)" />
                <path d="M7 20H17V22H7V20Z" fill="var(--text-dark)" />
              </svg>
            </div>
            <div class="arch-node__body">
              <span class="arch-node__name">Vue 3 Single Page App</span>
              <span class="arch-node__meta">Vite + Composition API + TS</span>
            </div>
          </div>
        </div>

        <!-- Flow Connector 1 -->
        <div class="arch-connector" aria-hidden="true">
          <div class="arch-connector__line" />
          <div
            class="arch-connector__pulse"
            :class="{ 'arch-connector__pulse--active': currentStep.fromNode === 'client' || currentStep.toNode === 'client' }"
            :style="{ '--pulse-color': latencyColor }"
          />
          <span class="arch-connector__label">{{ currentStep.protocol }}</span>
        </div>

        <!-- Tier 2: Cloudflare Global Edge & Security -->
        <div class="arch-tier arch-tier--edge">
          <div class="arch-tier__header">
            <span class="arch-tier__badge arch-tier__badge--yellow">Anycast Edge</span>
            <span class="arch-tier__title">Cloudflare Edge POP</span>
          </div>

          <div class="arch-tier__nodes-grid">
            <!-- Node: Anycast POP Routing -->
            <div
              class="arch-node arch-node--pop"
              :class="{
                'arch-node--active': currentScenario.activeNodes.includes('edge-pop'),
                'arch-node--highlight': currentStep.fromNode === 'edge-pop' || currentStep.toNode === 'edge-pop',
              }"
            >
              <div class="arch-node__icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                  <path d="M4 14H2V10H4V8H8V6H14V8H18V10H22V14H20V16H18V18H6V16H4V14Z" fill="var(--yellow-main)" />
                </svg>
              </div>
              <div class="arch-node__body">
                <span class="arch-node__name">{{ edgeLabel }}</span>
                <span class="arch-node__meta">TLS 1.3 / HTTP/3 Termination</span>
              </div>
            </div>

            <!-- Node: Cloudflare Turnstile -->
            <div
              class="arch-node arch-node--turnstile"
              :class="{
                'arch-node--active': currentScenario.activeNodes.includes('turnstile-svc'),
                'arch-node--highlight': currentStep.fromNode === 'turnstile-svc' || currentStep.toNode === 'turnstile-svc',
              }"
              @click="selectTech('turnstile')"
            >
              <div class="arch-node__icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                  <path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" fill="var(--yellow-light)" stroke="var(--yellow-main)" stroke-width="2" />
                  <path d="M10 12L12 14L16 9" stroke="var(--text-dark)" stroke-width="2" stroke-linecap="round" />
                </svg>
              </div>
              <div class="arch-node__body">
                <span class="arch-node__name">Turnstile Bot Engine</span>
                <span class="arch-node__meta">Siteverify & Crypto Handshake</span>
              </div>
            </div>

            <!-- Node: Cloudflare ASSETS & Cache -->
            <div
              class="arch-node arch-node--assets"
              :class="{
                'arch-node--active': currentScenario.activeNodes.includes('assets-cdn'),
                'arch-node--highlight': currentStep.fromNode === 'assets-cdn' || currentStep.toNode === 'assets-cdn',
              }"
              @click="selectTech('assets')"
            >
              <div class="arch-node__icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                  <rect x="3" y="4" width="18" height="16" rx="2" fill="var(--blue-light)" stroke="var(--blue-main)" stroke-width="2" />
                  <line x1="3" y1="9" x2="21" y2="9" stroke="var(--blue-main)" stroke-width="2" />
                  <circle cx="6" cy="6.5" r="1" fill="var(--blue-main)" />
                  <circle cx="9" cy="6.5" r="1" fill="var(--blue-main)" />
                </svg>
              </div>
              <div class="arch-node__body">
                <span class="arch-node__name">ASSETS & CDN Cache</span>
                <span class="arch-node__meta">Global Static Asset Storage</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Flow Connector 2 -->
        <div class="arch-connector" aria-hidden="true">
          <div class="arch-connector__line" />
          <div
            class="arch-connector__pulse"
            :class="{ 'arch-connector__pulse--active': currentStep.fromNode === 'workers-api' || currentStep.toNode === 'workers-api' }"
            :style="{ '--pulse-color': 'var(--green-main)' }"
          />
          <span class="arch-connector__label">Worker Runtime Bus</span>
        </div>

        <!-- Tier 3: Cloudflare Workers Runtime & AI Proxy -->
        <div class="arch-tier arch-tier--workers">
          <div class="arch-tier__header">
            <span class="arch-tier__badge arch-tier__badge--blue">Serverless Compute</span>
            <span class="arch-tier__title">Cloudflare Workers</span>
          </div>

          <div class="arch-tier__nodes-grid">
            <!-- Node: Hono API Worker -->
            <div
              class="arch-node arch-node--worker"
              :class="{
                'arch-node--active': currentScenario.activeNodes.includes('workers-api'),
                'arch-node--highlight': currentStep.fromNode === 'workers-api' || currentStep.toNode === 'workers-api',
              }"
              @click="selectTech('workers')"
            >
              <div class="arch-node__icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                  <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" fill="var(--blue-main)" />
                </svg>
              </div>
              <div class="arch-node__body">
                <span class="arch-node__name">Portfolio Worker</span>
                <span class="arch-node__meta">Hono API + TypeScript Isolate</span>
              </div>
            </div>

            <!-- Node: AI Chat Proxy -->
            <div
              class="arch-node arch-node--chat"
              :class="{
                'arch-node--active': currentScenario.activeNodes.includes('chat-proxy'),
                'arch-node--highlight': currentStep.fromNode === 'chat-proxy' || currentStep.toNode === 'chat-proxy',
              }"
              @click="selectTech('chat')"
            >
              <div class="arch-node__icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                  <rect x="3" y="4" width="18" height="13" rx="2" fill="var(--lavender-light)" stroke="var(--lavender-main)" stroke-width="2" />
                  <path d="M8 17L5 20V17H8Z" fill="var(--lavender-main)" />
                  <circle cx="8" cy="10.5" r="1.5" fill="var(--text-dark)" />
                  <circle cx="12" cy="10.5" r="1.5" fill="var(--text-dark)" />
                  <circle cx="16" cy="10.5" r="1.5" fill="var(--text-dark)" />
                </svg>
              </div>
              <div class="arch-node__body">
                <span class="arch-node__name">Arya AI Persona Engine</span>
                <span class="arch-node__meta">Context Router & SSE Stream</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Flow Connector 3 -->
        <div class="arch-connector" aria-hidden="true">
          <div class="arch-connector__line" />
          <div
            class="arch-connector__pulse"
            :class="{ 'arch-connector__pulse--active': currentStep.fromNode === 'd1-db' || currentStep.toNode === 'd1-db' || currentStep.fromNode === 'kv-cache' || currentStep.toNode === 'kv-cache' }"
            :style="{ '--pulse-color': 'var(--lavender-main)' }"
          />
          <span class="arch-connector__label">D1 & KV Bindings</span>
        </div>

        <!-- Tier 4: Edge Storage Layer -->
        <div class="arch-tier arch-tier--storage">
          <div class="arch-tier__header">
            <span class="arch-tier__badge arch-tier__badge--green">Edge Storage</span>
            <span class="arch-tier__title">D1 SQL & KV Cache</span>
          </div>

          <div class="arch-tier__nodes-grid">
            <!-- Node: Cloudflare D1 -->
            <div
              class="arch-node arch-node--d1"
              :class="{
                'arch-node--active': currentScenario.activeNodes.includes('d1-db'),
                'arch-node--highlight': currentStep.fromNode === 'd1-db' || currentStep.toNode === 'd1-db',
              }"
              @click="selectTech('d1')"
            >
              <div class="arch-node__icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                  <ellipse cx="12" cy="6" rx="8" ry="3" fill="var(--green-light)" stroke="var(--green-main)" stroke-width="2" />
                  <path d="M4 6V12C4 13.66 7.58 15 12 15C16.42 15 20 13.66 20 12V6" stroke="var(--green-main)" stroke-width="2" />
                  <path d="M4 12V18C4 19.66 7.58 21 12 21C16.42 21 20 19.66 20 18V12" stroke="var(--green-main)" stroke-width="2" />
                </svg>
              </div>
              <div class="arch-node__body">
                <span class="arch-node__name">Cloudflare D1 (SQL)</span>
                <span class="arch-node__meta">Distributed SQLite Database</span>
              </div>
            </div>

            <!-- Node: Cloudflare KV -->
            <div
              class="arch-node arch-node--kv"
              :class="{
                'arch-node--active': currentScenario.activeNodes.includes('kv-cache'),
                'arch-node--highlight': currentStep.fromNode === 'kv-cache' || currentStep.toNode === 'kv-cache',
              }"
              @click="selectTech('kv')"
            >
              <div class="arch-node__icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
                  <rect x="3" y="4" width="18" height="6" rx="2" fill="var(--pink-light)" stroke="var(--pink-main)" stroke-width="2" />
                  <rect x="3" y="14" width="18" height="6" rx="2" fill="var(--pink-light)" stroke="var(--pink-main)" stroke-width="2" />
                  <circle cx="7" cy="7" r="1" fill="var(--pink-main)" />
                  <circle cx="7" cy="17" r="1" fill="var(--pink-main)" />
                </svg>
              </div>
              <div class="arch-node__body">
                <span class="arch-node__name">Cloudflare KV Store</span>
                <span class="arch-node__meta">Sub-10ms Global Read Cache</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Live Step Callout Box -->
      <div class="arch-step-callout">
        <div class="arch-step-callout__badge">
          <span class="arch-step-callout__indicator" />
          Active Step Action:
        </div>
        <div class="arch-step-callout__content">
          <span class="arch-step-callout__text">{{ currentStep.action }}</span>
          <span class="arch-step-callout__tag">{{ currentStep.techBadge }}</span>
        </div>
      </div>
    </div>

    <!-- Featured Cloudflare Technology Stack Cards -->
    <div class="edge-tech-grid-wrapper">
      <h3 class="edge-tech-grid-title">Featured Cloudflare Technologies In This App</h3>
      <div class="edge-tech-grid">
        <div
          v-for="tech in techFeatures"
          :key="tech.id"
          class="tech-card"
          :class="{ 'tech-card--selected': selectedTechId === tech.id }"
          :style="{ '--tech-accent': tech.color, '--tech-bg-light': tech.bgLight }"
          @click="selectTech(tech.id)"
        >
          <div class="tech-card__top">
            <span class="tech-card__name">{{ tech.name }}</span>
            <span class="tech-card__badge">{{ tech.badge }}</span>
          </div>
          <div class="tech-card__role">{{ tech.role }}</div>
          <p class="tech-card__desc">{{ tech.description }}</p>
        </div>
      </div>
    </div>

    <!-- Technical Specs & Control Bar -->
    <footer class="edge-tech-viz__footer">
      <div class="edge-tech-viz__footer-stats">
        <span class="footer-stat-item">
          <strong>Cache Verdict:</strong> {{ data?.cacheStatus ?? 'DYNAMIC' }}
        </span>
        <span class="footer-stat-item">
          <strong>Ray ID:</strong> <code class="footer-code">{{ data?.ray ?? 'cf-ray-live' }}</code>
        </span>
        <span class="footer-stat-item">
          <strong>Security:</strong> TLS 1.3 / Turnstile Enabled
        </span>
      </div>

      <div class="edge-tech-viz__footer-actions">
        <button
          type="button"
          class="refresh-btn"
          :disabled="edgeLoading"
          aria-label="Refresh telemetry and rerun simulation"
          @click="() => { refreshEdge(); refreshLatency(); }"
        >
          {{ edgeLoading ? 'Updating…' : 'Refresh Telemetry ⟳' }}
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.edge-tech-viz {
  padding: var(--space-xl) var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  max-width: 1100px;
  margin: var(--space-2xl) auto;
  font-family: 'Nunito', sans-serif;
  /*
   * Same fade-and-lift as `useReveal`, but kept local on purpose: the observer
   * below is doing two jobs at once — a one-shot `revealed` flag and a
   * continuous `inView` flag that starts and stops the canvas loop. Swapping in
   * the composable would mean a second observer on the same element to get the
   * one behaviour it covers. Timing comes from the shared tokens so the two
   * still move identically; only the plumbing differs.
   */
  opacity: 0;
  transform: translateY(var(--motion-rise));
  transition:
    opacity var(--motion-base) var(--ease-settle),
    transform var(--motion-base) var(--ease-settle);
}

.edge-tech-viz--revealed {
  opacity: 1;
  transform: none;
}

/* Header */
.edge-tech-viz__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 2px dashed var(--divider);
}

.edge-tech-viz__title-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edge-tech-viz__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.edge-tech-viz__pixel-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.edge-tech-viz__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-dark);
}

.edge-tech-viz__subtitle {
  font-size: 0.9rem;
  color: var(--text-medium);
  line-height: 1.45;
}

/* Live Telemetry Strip */
.edge-tech-viz__live-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-sm);
}

.live-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--surface-sunken);
  border: 2px solid var(--border);
  border-radius: var(--radius-badge);
  font-size: 0.75rem;
  color: var(--text-dark);
}

.live-tag__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.live-tag__label {
  font-family: 'Pixelify Sans', monospace;
  font-weight: 600;
  color: var(--text-medium);
}

.live-tag__value {
  font-family: 'Pixelify Sans', monospace;
  font-weight: 700;
  color: var(--text-dark);
}

/* Flow Tabs */
.edge-tech-viz__tabs-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.edge-tech-viz__tabs-label {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-medium);
}

.edge-tech-viz__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.flow-tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: var(--surface-sunken);
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
  transition: all 0.15s ease;
}

.flow-tab-btn:hover {
  background: var(--blue-light);
  border-color: var(--blue-main);
  transform: translateY(-1px);
}

.flow-tab-btn--active {
  background: var(--blue-main);
  border-color: var(--focus-ring);
  color: var(--text-dark);
  font-weight: 700;
}

.flow-tab-btn__icon {
  font-size: 0.95rem;
}

/* Scenario Banner */
.scenario-banner {
  background: var(--surface);
  border: 2px solid var(--divider);
  border-radius: var(--radius-input);
  padding: var(--space-md);
  margin-bottom: var(--space-lg);
}

.scenario-banner__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: 12px;
}

.scenario-banner__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-dark);
}

.scenario-banner__step-counter {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 8px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-badge);
  color: var(--text-medium);
  white-space: nowrap;
  flex-shrink: 0;
}

.scenario-banner__text {
  font-size: 0.82rem;
  color: var(--text-medium);
  line-height: 1.45;
}

/* Architecture Canvas */
.arch-canvas {
  background: var(--surface-sunken);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-bottom: var(--space-xl);
  position: relative;
  overflow: hidden;
}

.arch-canvas__tiers {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

@media (min-width: 900px) {
  .arch-canvas__tiers {
    display: grid;
    grid-template-columns: 1.1fr auto 1.4fr auto 1.3fr auto 1.3fr;
    align-items: center;
    gap: var(--space-sm);
  }
}

/* Tiers */
.arch-tier {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  background: var(--surface);
  border: 2px solid var(--divider);
  border-radius: var(--radius-input);
  padding: var(--space-sm);
}

.arch-tier__header {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--divider);
}

.arch-tier__badge {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--blue-main);
  text-transform: uppercase;
}

.arch-tier__badge--yellow {
  color: var(--yellow-main);
}

.arch-tier__badge--blue {
  color: var(--blue-main);
}

.arch-tier__badge--green {
  color: var(--green-main);
}

.arch-tier__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-dark);
}

.arch-tier__nodes-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

/* Nodes */
.arch-node {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 8px 10px;
  background: var(--surface-sunken);
  border: 2px solid var(--border);
  border-radius: var(--radius-btn);
  transition: all 0.18s ease;
  cursor: pointer;
}

.arch-node:hover {
  border-color: var(--blue-main);
  background: var(--surface);
  transform: scale(1.02);
}

.arch-node--active {
  border-color: var(--blue-main);
  background: var(--surface);
}

.arch-node--highlight {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 2px var(--yellow-main);
  background: var(--surface-raised);
}

.arch-node__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.arch-node__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
}

.arch-node__name {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.arch-node__meta {
  font-size: 0.65rem;
  color: var(--text-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Connectors */
.arch-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  min-height: 36px;
  min-width: 32px;
}

.arch-connector__line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: var(--border);
  transform: translateX(-50%);
}

@media (min-width: 900px) {
  .arch-connector__line {
    top: 50%;
    bottom: auto;
    left: 0;
    right: 0;
    width: 100%;
    height: 2px;
    transform: translateY(-50%);
  }
}

.arch-connector__pulse {
  position: relative;
  z-index: 2;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--border);
  border: 1px solid var(--text-medium);
  transition: all 0.2s ease;
}

.arch-connector__pulse--active {
  background: var(--pulse-color, var(--yellow-main));
  transform: scale(1.3);
}

.arch-connector__label {
  display: none;
}

/* Step Callout */
.arch-step-callout {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-md);
  padding: 8px 12px;
  background: var(--surface);
  border: 2px dashed var(--blue-main);
  border-radius: var(--radius-input);
}

.arch-step-callout__badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-medium);
}

.arch-step-callout__indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-online);
  animation: pulse-dot 1.2s infinite ease-in-out;
}

@keyframes pulse-dot {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.25); opacity: 0.6; }
}

.arch-step-callout__content {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.arch-step-callout__text {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dark);
}

.arch-step-callout__tag {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 8px;
  background: var(--blue-light);
  border: 1px solid var(--blue-main);
  border-radius: var(--radius-badge);
  color: var(--text-dark);
  white-space: nowrap;
}

/* Technology Stack Cards - Hidden on mobile to keep the layout concise and clean */
.edge-tech-grid-wrapper {
  display: none;
  margin-top: var(--space-lg);
  margin-bottom: var(--space-lg);
}

@media (min-width: 768px) {
  .edge-tech-grid-wrapper {
    display: block;
  }
}

.edge-tech-grid-title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-md);
}

.edge-tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-md);
}

.tech-card {
  padding: var(--space-md);
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius-input);
  transition: all 0.18s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tech-card:hover {
  border-color: var(--tech-accent, var(--blue-main));
  transform: translateY(-2px);
}

.tech-card--selected {
  border-color: var(--tech-accent, var(--blue-main));
  background: var(--tech-bg-light, var(--blue-light));
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.tech-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
}

.tech-card__name {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dark);
}

.tech-card__badge {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 6px;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-badge);
  color: var(--text-medium);
  white-space: nowrap;
}

.tech-card__role {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-medium);
}

.tech-card__desc {
  font-size: 0.78rem;
  color: var(--text-dark);
  line-height: 1.45;
}

/* Footer */
.edge-tech-viz__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding-top: var(--space-md);
  border-top: 2px dashed var(--divider);
}

.edge-tech-viz__footer-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  font-size: 0.75rem;
  color: var(--text-medium);
}

.footer-stat-item strong {
  font-family: 'Pixelify Sans', monospace;
  color: var(--text-dark);
}

.footer-code {
  font-family: 'Pixelify Sans', monospace;
  color: var(--code-text);
  background: var(--surface-sunken);
  padding: 1px 4px;
  border-radius: 4px;
}

.refresh-btn {
  padding: 6px 14px;
  background: var(--blue-light);
  border: 2px solid var(--blue-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--blue-main);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
