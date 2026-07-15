<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useEdgeStatus } from '@/composables/useEdgeStatus'

const { data } = useEdgeStatus(30000)

const containerRef = ref<HTMLElement | null>(null)
const isVisible = ref(false)
const packetActive = ref(false)
let animationInterval: ReturnType<typeof setInterval> | null = null
let observer: IntersectionObserver | null = null

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

const edgeLabel = computed(() => {
  if (!data.value?.colo || data.value.colo === 'unknown') {
    return 'Edge Node'
  }
  return popNameMap[data.value.colo] ?? `${data.value.colo} Edge`
})

function startAnimation() {
  if (animationInterval) return
  triggerPacket()
  animationInterval = setInterval(triggerPacket, 2000)
}

function stopAnimation() {
  if (animationInterval) {
    clearInterval(animationInterval)
    animationInterval = null
  }
}

function triggerPacket() {
  packetActive.value = false
  // Force reflow to restart animation
  requestAnimationFrame(() => {
    packetActive.value = true
  })
}

onMounted(() => {
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry) {
        isVisible.value = entry.isIntersecting
        if (entry.isIntersecting) {
          startAnimation()
        } else {
          stopAnimation()
        }
      }
    },
    { threshold: 0.2 },
  )

  if (containerRef.value) {
    observer.observe(containerRef.value)
  }
})

onUnmounted(() => {
  stopAnimation()
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <div ref="containerRef" class="edge-viz" aria-label="Edge network visualization">
    <h3 class="edge-viz__title">How Cloudflare Edge Serves This Site</h3>

    <div class="edge-viz__flow">
      <!-- Visitor node -->
      <div class="edge-viz__node edge-viz__node--visitor">
        <span class="edge-viz__node-icon">👤</span>
        <span class="edge-viz__node-label">Visitor</span>
      </div>

      <!-- Connection line 1 -->
      <div class="edge-viz__connector">
        <div class="edge-viz__line" />
        <div
          v-if="packetActive"
          class="edge-viz__packet edge-viz__packet--down1"
        />
        <span class="edge-viz__arrow">↓</span>
      </div>

      <!-- Edge node -->
      <div class="edge-viz__node edge-viz__node--edge">
        <span class="edge-viz__node-icon">☁</span>
        <span class="edge-viz__node-label">{{ edgeLabel }}</span>
      </div>

      <!-- Connection line 2 -->
      <div class="edge-viz__connector">
        <div class="edge-viz__line" />
        <div
          v-if="packetActive"
          class="edge-viz__packet edge-viz__packet--down2"
        />
        <span class="edge-viz__arrow">↓</span>
      </div>

      <!-- Portfolio node -->
      <div class="edge-viz__node edge-viz__node--portfolio">
        <span class="edge-viz__node-icon">🌐</span>
        <span class="edge-viz__node-label">Portfolio</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edge-viz {
  padding: var(--space-xl) var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  text-align: center;
  max-width: 320px;
  margin: var(--space-2xl) auto;
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

.edge-viz__connector {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 48px;
  width: 20px;
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

.edge-viz__arrow {
  position: relative;
  z-index: 1;
  font-family: 'Pixelify Sans', monospace;
  font-size: 1rem;
  color: var(--text-medium);
}

.edge-viz__packet {
  position: absolute;
  left: 50%;
  width: 8px;
  height: 8px;
  background: var(--lavender-main);
  border: 1px solid var(--text-medium);
  border-radius: 2px;
  transform: translateX(-50%);
  opacity: 0;
}

.edge-viz__packet--down1 {
  animation: packet-move 0.8s ease-in-out forwards;
}

.edge-viz__packet--down2 {
  animation: packet-move 0.8s ease-in-out 0.6s forwards;
}

@keyframes packet-move {
  0% {
    top: 0;
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    top: 100%;
    opacity: 0;
  }
}
</style>
