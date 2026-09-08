<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useWeather, type WeatherCondition } from '@/composables/useWeather'
import { useCountUp } from '@/composables/useCountUp'
import { useReveal } from '@/composables/useReveal'
import WeatherSky from '@/components/weather/WeatherSky.vue'

const { data, isLoading, isUnavailable, error, refresh } = useWeather()

// Below the fold, so the panel arrives when it is scrolled to rather than at mount
// — LazySection renders it ~250px early, and an entrance spent off-screen is an
// entrance nobody sees. Same reasoning as EdgeInsights.
const { target: panel } = useReveal()

/** Daytime label, then the night variant where one reads better after dark. */
const CONDITION_LABELS: Record<WeatherCondition, string> = {
  clear: 'Cerah',
  clouds: 'Berawan',
  rain: 'Hujan',
  drizzle: 'Gerimis',
  thunder: 'Badai petir',
  snow: 'Bersalju',
  mist: 'Berkabut',
}

const conditionLabel = computed(() => {
  if (!data.value) return ''
  const base = CONDITION_LABELS[data.value.condition]
  // "Cerah" at midnight describes a cloudless sky nobody can see. Naming the stars
  // is both more accurate and the more charming of the two.
  if (data.value.condition === 'clear' && data.value.isNight) return 'Cerah berbintang'
  return base
})

/*
 * Temperature and humidity settle into place; wind does not.
 *
 * Wind is reported to one decimal, and `useCountUp` tweens through a float — the
 * tenths digit would spin through ten states in a fifth of a second, which reads as
 * a glitch rather than as a value arriving. Whole numbers settle cleanly, fractions
 * do not, so only the whole ones get the treatment.
 */
const { display: tempC } = useCountUp(computed(() => data.value?.tempC ?? null))
const { display: humidity } = useCountUp(computed(() => data.value?.humidity ?? null))

const stats = computed(() => {
  if (!data.value) return []
  return [
    { label: 'Terasa seperti', value: `${data.value.feelsLikeC}°` },
    { label: 'Kelembapan', value: `${humidity.value}%` },
    { label: 'Angin', value: `${data.value.windSpeedMs.toFixed(1)} m/s` },
  ]
})

/**
 * Where the coordinates came from.
 *
 * Surfaced rather than hidden: outside a real Cloudflare edge `request.cf` carries
 * no latitude, so the worker falls back to Jakarta. The weather is still real
 * weather — it is simply real weather somewhere the visitor may not be, and saying
 * so is the difference between a fallback and a lie.
 */
const isFallbackLocation = computed(() => data.value?.geoSource === 'fallback')

// Reactive clock for the age stamp; `Date.now()` inside a computed would freeze at
// first evaluation. Copy is minute-granular, so a 30s tick is more than enough.
const now = ref(Date.now())
const TICK_MS = 30_000

/** Honest about age: this is an observation with a timestamp, not a live sensor. */
const observedAgo = computed(() => {
  if (!data.value) return ''
  const seconds = Math.max(
    0,
    Math.round((now.value - new Date(data.value.observedAt).getTime()) / 1000),
  )
  if (seconds < 90) return 'baru diamati'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `diamati ${minutes} menit lalu`
  const hours = Math.round(minutes / 60)
  return `diamati ${hours} jam lalu`
})

let tickTimer: ReturnType<typeof setInterval> | null = null

function startTicking() {
  if (tickTimer !== null) return
  // Resync on start, so a tab coming back to the foreground shows the correct age
  // immediately instead of a stale one for up to a full interval.
  now.value = Date.now()
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)
}

function stopTicking() {
  if (tickTimer !== null) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

function handleVisibilityChange() {
  if (document.hidden) stopTicking()
  else startTicking()
}

onMounted(() => {
  if (!document.hidden) startTicking()
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  stopTicking()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <!--
    Hidden only when the server has no OpenWeather key — a deployment state, like a
    switched-off Insights panel. A transient upstream failure deliberately does not
    hide the section: the breaker closes again after two minutes, and a section that
    vanishes and returns reflows the page under whoever is reading it.
  -->
  <section v-if="!isUnavailable" ref="panel" class="weather" aria-labelledby="weather-title">
    <header class="weather__header">
      <div>
        <h2 id="weather-title" class="weather__title">⛅ Edge Weather</h2>
        <p class="weather__subtitle">
          Cuaca di lokasi edge Cloudflare yang melayani kamu, lewat API Gateway worker.
        </p>
      </div>
      <span
        v-if="data"
        class="weather__badge"
        :title="`Sumber: ${data.cached ? 'KV cache' : 'OpenWeather live'}`"
      >
        {{ data.cached ? 'KV cache' : 'live' }}
      </span>
    </header>

    <div v-if="error && !data" class="weather__error">
      <p class="weather__error-text">{{ error }}</p>
      <button class="weather__retry" type="button" @click="refresh">Coba lagi ⟳</button>
    </div>

    <div v-else-if="isLoading && !data" class="weather__skeleton">
      <div class="weather__skeleton-scene" />
      <div class="weather__skeleton-lines">
        <div v-for="i in 4" :key="i" class="weather__skeleton-row" />
      </div>
    </div>

    <div v-else-if="data" class="weather__body">
      <div class="weather__scene">
        <WeatherSky :condition="data.condition" :is-night="data.isNight" />
        <div class="weather__reading">
          <p class="weather__temp">
            <span class="weather__temp-value">{{ tempC }}</span
            ><span class="weather__temp-unit">°C</span>
          </p>
          <p class="weather__condition">{{ conditionLabel }}</p>
          <p class="weather__place">
            {{ data.place }}<span v-if="data.countryCode !== 'unknown'">, {{ data.countryCode }}</span>
          </p>
        </div>
      </div>

      <div class="weather__stats m-cascade">
        <div v-for="stat in stats" :key="stat.label" class="weather__stat">
          <span class="weather__stat-value">{{ stat.value }}</span>
          <span class="weather__stat-label">{{ stat.label }}</span>
        </div>
      </div>

      <!-- A refresh that failed while a previous reading is still on screen. The
           reading stays — it is stamped with its own age below — and this says why
           it has stopped moving, which a silently frozen panel would not. -->
      <p v-if="error" class="weather__notice">{{ error }}</p>

      <p v-if="isFallbackLocation" class="weather__notice weather__notice--soft">
        Edge tidak mengirim koordinat di sini, jadi lokasinya jatuh ke Jakarta.
      </p>

      <footer class="weather__footer">
        <span class="weather__stamp">
          {{ observedAgo }} · POP {{ data.colo }}
        </span>
        <button class="weather__refresh" type="button" :disabled="isLoading" @click="refresh">
          {{ isLoading ? '...' : 'Refresh ⟳' }}
        </button>
      </footer>
    </div>
  </section>
</template>

<style scoped>
/* Same glass surface as EdgeInsights, so the two below-fold panels read as a pair
   rather than as two designs. Glass is allowed here — design.md permits it on
   cards, and denies it to buttons and badges, which stay solid. */
.weather {
  padding: var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  font-family: 'Nunito', sans-serif;
}

.weather__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-md);
  border-bottom: 2px dashed var(--divider);
}

.weather__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-xs);
}

.weather__subtitle {
  font-size: 0.85rem;
  color: var(--text-medium);
}

.weather__badge {
  padding: 2px 10px;
  border: 2px solid var(--border);
  border-radius: var(--radius-badge);
  background: var(--surface-sunken);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-medium);
  cursor: help;
  white-space: nowrap;
}

.weather__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.weather__scene {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-lg);
}

.weather__reading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.weather__temp {
  display: flex;
  align-items: baseline;
  gap: 1px;
}

.weather__temp-value {
  font-family: 'Pixelify Sans', monospace;
  font-size: 3rem;
  line-height: 1;
  font-weight: 700;
  color: var(--text-dark);
  /* Tweened digits. Without tabular figures the unit beside them and the two lines
     underneath shuffle sideways on every frame while the number settles. */
  font-variant-numeric: tabular-nums;
}

.weather__temp-unit {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-medium);
}

.weather__condition {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-dark);
}

.weather__place {
  font-size: 0.8rem;
  color: var(--text-medium);
}

.weather__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--space-sm);
}

.weather__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-sm);
  background: var(--surface-sunken);
  border: 2px solid var(--divider);
  border-radius: var(--radius-input);
}

.weather__stat-value {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-dark);
  font-variant-numeric: tabular-nums;
}

.weather__stat-label {
  font-size: 0.7rem;
  color: var(--text-medium);
  text-align: center;
}

.weather__notice {
  font-size: 0.75rem;
  color: var(--status-error);
}

.weather__notice--soft {
  color: var(--text-medium);
}

.weather__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 2px dashed var(--divider);
}

.weather__stamp {
  font-size: 0.7rem;
  color: var(--text-medium);
}

.weather__refresh {
  padding: 6px 14px;
  background: var(--blue-light);
  border: 2px solid var(--blue-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
}

.weather__refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.weather__error {
  text-align: center;
  padding: var(--space-md) 0;
}

.weather__error-text {
  font-size: 0.85rem;
  color: var(--status-error);
  margin-bottom: var(--space-sm);
}

.weather__retry {
  padding: 6px 14px;
  background: var(--pink-light);
  border: 2px solid var(--pink-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
}

/* Skeleton mirrors the real layout — a square where the scene goes, lines where the
   reading goes — so the panel does not change shape when the data lands. */
.weather__skeleton {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-lg);
}

.weather__skeleton-scene {
  width: 132px;
  height: 132px;
  flex: none;
  border-radius: 4px;
  background: var(--divider);
}

.weather__skeleton-lines {
  display: flex;
  flex: 1 1 160px;
  flex-direction: column;
  gap: var(--space-sm);
}

.weather__skeleton-row,
.weather__skeleton-scene {
  background: linear-gradient(
    90deg,
    var(--divider) 25%,
    var(--bg-soft) 50%,
    var(--divider) 75%
  );
  background-size: 200% 100%;
  animation: weather-shimmer 1.5s infinite ease-in-out;
}

.weather__skeleton-row {
  height: 16px;
  border-radius: 4px;
}

.weather__skeleton-row:nth-child(even) {
  width: 70%;
}

@keyframes weather-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (min-width: 768px) {
  /* Tracks WeatherSky's own 2x -> 3x step at the same breakpoint, plus its 2px
     border on each side. If one moves without the other, the data landing resizes
     the panel. */
  .weather__skeleton-scene {
    width: 196px;
    height: 196px;
  }
}
</style>
