<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WeatherCondition } from '@/composables/useWeather'
import { useWeatherScene } from '@/composables/useWeatherScene'

const props = defineProps<{
  condition: WeatherCondition
  isNight: boolean
}>()

/**
 * Hand-authored 64x64 pixel scene, `<rect>` only, every coordinate a whole unit
 * on a 2px sub-grid.
 *
 * Everything here is structure; nothing here moves. `useWeatherScene` finds these
 * layers by their `data-layer` attributes and drives them, which keeps the art
 * readable as art and means the static render — reduced motion, or GSAP failing to
 * load — is already a complete picture rather than a from-state.
 *
 * Why `<rect>` and not a path: a path invites curves, and a curve on a 64-unit grid
 * is anti-aliased by definition. `design.md` rules that out, so the constraint is
 * enforced by the vocabulary rather than by discipline.
 */

/** Cloud body at the origin, translated into place per instance. */
const CLOUD_ROWS = [
  { x: 8, y: 0, w: 8 },
  { x: 6, y: 2, w: 14 },
  { x: 2, y: 4, w: 20 },
] as const

/**
 * Cloud positions, in draw order. Translation only — never a scale.
 *
 * Scaling one of these would put its edges on half-units and mix two pixel scales
 * in the same 64-unit frame, which `design.md` lists by name as a mistake. Depth
 * comes from the count and the placement instead.
 */
const CLOUD_SPOTS = [
  { x: 2, y: 26 },
  { x: 34, y: 16 },
  { x: 16, y: 36 },
] as const

const STAR_SPOTS = [
  { x: 8, y: 8 },
  { x: 20, y: 4 },
  { x: 56, y: 12 },
  { x: 14, y: 20 },
  { x: 28, y: 12 },
  { x: 58, y: 30 },
] as const

/** Sun ray pixels: four cardinal bars and four diagonal dots, all radial from (43,15). */
const RAY_PIXELS = [
  { x: 42, y: 2, w: 2, h: 4 },
  { x: 42, y: 24, w: 2, h: 4 },
  { x: 28, y: 14, w: 4, h: 2 },
  { x: 54, y: 14, w: 4, h: 2 },
  { x: 34, y: 6, w: 2, h: 2 },
  { x: 50, y: 6, w: 2, h: 2 },
  { x: 34, y: 22, w: 2, h: 2 },
  { x: 50, y: 22, w: 2, h: 2 },
] as const

const MIST_BARS = [
  { x: 30, y: 26, w: 20 },
  { x: 8, y: 34, w: 24 },
  { x: 20, y: 42, w: 28 },
  { x: 4, y: 48, w: 22 },
] as const

const isWet = computed(
  () =>
    props.condition === 'rain' ||
    props.condition === 'drizzle' ||
    props.condition === 'thunder',
)
const isSnow = computed(() => props.condition === 'snow')
const hasPrecipitation = computed(() => isWet.value || isSnow.value)

/** Sun and moon share the slot; only one is ever in the DOM. */
const showSun = computed(() => !props.isNight)

/**
 * How much sky is covered. `clear` shows none, so the conditions stay tellable
 * apart at a glance rather than all reading as "some clouds".
 */
const cloudCount = computed(() => {
  if (props.condition === 'clear') return 0
  if (props.condition === 'clouds') return 3
  if (props.condition === 'mist') return 1
  return 2
})

const clouds = computed(() => CLOUD_SPOTS.slice(0, cloudCount.value))

/**
 * Vertical band the precipitation falls through: from just under the highest
 * cloud down to the top of the ground band at y=52.
 *
 * Published to the DOM as `data-travel` rather than kept as a private constant,
 * because `useWeatherScene` needs the same number to wrap each drop back to the
 * top of the band. Two copies of it would drift apart the first time a cloud moves,
 * and the failure would be drops materialising in mid-air.
 */
const DROP_BAND_TOP = 32
const DROP_BAND_TRAVEL = 20

/**
 * Columns sit under the two clouds and skip the gap between them, so drops fall
 * out of something rather than out of clear sky. The start heights are irregular
 * on purpose: evenly spaced ones read as a marching row, not as rain.
 */
const DROP_COLUMNS = [
  { x: 6, y: 0 },
  { x: 14, y: 8 },
  { x: 22, y: 4 },
  { x: 38, y: 0 },
  { x: 46, y: 12 },
  { x: 54, y: 6 },
] as const

const drops = computed(() => {
  if (!hasPrecipitation.value) return []
  // A rain streak is a 2x4 bar; drizzle and snow are 2x2 specks.
  const h = props.condition === 'rain' || props.condition === 'thunder' ? 4 : 2
  return DROP_COLUMNS.map((column) => ({
    x: column.x,
    y: DROP_BAND_TOP + column.y,
    h,
  }))
})

const root = ref<SVGSVGElement | null>(null)

useWeatherScene(root, {
  condition: computed(() => props.condition),
  isNight: computed(() => props.isNight),
})
</script>

<template>
  <!--
    aria-hidden because the panel already states the condition, the temperature and
    the place in text next to this. Labelling the scene too would make a screen
    reader announce the same weather twice, and the second reading would be the
    worse one.

    Layer order is load-bearing: the ground is painted last so precipitation
    disappears behind it instead of falling off the bottom of the frame.
  -->
  <svg
    ref="root"
    class="sky"
    :class="{ 'sky--night': isNight }"
    viewBox="0 0 64 64"
    shape-rendering="crispEdges"
    aria-hidden="true"
    focusable="false"
    xmlns="http://www.w3.org/2000/svg"
  >
    <g data-layer="sky">
      <rect x="0" y="0" width="64" height="64" fill="var(--w-sky)" />
      <rect x="0" y="44" width="64" height="8" fill="var(--w-haze)" />
    </g>

    <g v-if="showSun" data-layer="sun">
      <rect x="40" y="8" width="6" height="2" fill="var(--w-sun)" />
      <rect x="38" y="10" width="10" height="2" fill="var(--w-sun)" />
      <rect x="36" y="12" width="14" height="2" fill="var(--w-sun)" />
      <rect x="36" y="14" width="14" height="2" fill="var(--w-sun)" />
      <rect x="36" y="16" width="14" height="2" fill="var(--w-sun)" />
      <rect x="38" y="18" width="10" height="2" fill="var(--w-sun)" />
      <rect x="40" y="20" width="6" height="2" fill="var(--w-sun)" />
    </g>
    <g v-if="showSun" data-layer="rays">
      <rect
        v-for="(ray, i) in RAY_PIXELS"
        :key="`ray-${i}`"
        data-ray
        :x="ray.x"
        :y="ray.y"
        :width="ray.w"
        :height="ray.h"
        fill="var(--w-sun)"
      />
    </g>

    <!-- Crescent authored directly as spans, rather than a disc with a hole punched
         in it by a sky-coloured rect. A punch-out only looks right while it sits on
         flat sky; the moment a cloud passes behind it the bite turns opaque. -->
    <g v-if="!showSun" data-layer="moon">
      <rect x="38" y="8" width="6" height="2" fill="var(--w-moon)" />
      <rect x="36" y="10" width="6" height="2" fill="var(--w-moon)" />
      <rect x="36" y="12" width="4" height="2" fill="var(--w-moon)" />
      <rect x="36" y="14" width="4" height="2" fill="var(--w-moon)" />
      <rect x="36" y="16" width="4" height="2" fill="var(--w-moon)" />
      <rect x="36" y="18" width="6" height="2" fill="var(--w-moon)" />
      <rect x="38" y="20" width="6" height="2" fill="var(--w-moon)" />
    </g>
    <g v-if="!showSun" data-layer="stars">
      <rect
        v-for="(star, i) in STAR_SPOTS"
        :key="`star-${i}`"
        data-star
        :x="star.x"
        :y="star.y"
        width="2"
        height="2"
        fill="var(--w-star)"
      />
    </g>

    <g data-layer="clouds">
      <!-- Two nested groups on purpose: the outer one carries the position and is
           owned by Vue, the inner one carries the drift and is owned by GSAP. One
           shared group would mean both writing the same `transform` attribute, and
           a re-render mid-drift would fight the tween. -->
      <g
        v-for="(cloud, i) in clouds"
        :key="`cloud-${i}`"
        :transform="`translate(${cloud.x} ${cloud.y})`"
      >
        <g data-cloud>
          <rect
            v-for="(row, r) in CLOUD_ROWS"
            :key="`row-${r}`"
            :x="row.x"
            :y="row.y"
            :width="row.w"
            height="2"
            fill="var(--w-cloud)"
          />
          <rect x="0" y="6" width="24" height="2" fill="var(--w-cloud-shade)" />
        </g>
      </g>
    </g>

    <g
      v-if="drops.length"
      data-layer="drops"
      :data-top="DROP_BAND_TOP"
      :data-travel="DROP_BAND_TRAVEL"
    >
      <rect
        v-for="(drop, i) in drops"
        :key="`drop-${i}`"
        data-drop
        :x="drop.x"
        :y="drop.y"
        width="2"
        :height="drop.h"
        :fill="isSnow ? 'var(--w-snow)' : 'var(--w-rain)'"
      />
    </g>

    <!-- Baseline opacity is 1, so the bolt is part of the picture rather than
         something that only exists during a flash. `useWeatherScene` dims it and
         brings it back; it never strobes. -->
    <g v-if="condition === 'thunder'" data-layer="bolt">
      <rect x="34" y="24" width="4" height="8" fill="var(--w-bolt)" />
      <rect x="30" y="32" width="8" height="4" fill="var(--w-bolt)" />
      <rect x="28" y="36" width="4" height="8" fill="var(--w-bolt)" />
    </g>

    <g v-if="condition === 'mist'" data-layer="mist">
      <rect
        v-for="(bar, i) in MIST_BARS"
        :key="`mist-${i}`"
        data-mist
        :x="bar.x"
        :y="bar.y"
        :width="bar.w"
        height="2"
        fill="var(--w-mist)"
      />
    </g>

    <g data-layer="ground">
      <rect x="0" y="52" width="64" height="12" fill="var(--w-ground)" />
      <rect x="6" y="48" width="22" height="4" fill="var(--w-ground-2)" />
      <rect x="12" y="44" width="10" height="4" fill="var(--w-ground-2)" />
      <rect x="42" y="48" width="18" height="4" fill="var(--w-ground-2)" />
    </g>
  </svg>
</template>

<style scoped>
/*
 * Fills are CSS variables rather than literals so day and night swap in one place
 * instead of duplicating 40 rects. The values are still flat hex — no gradients,
 * per design.md — and they are deliberately *not* the site's `--blue-main` family:
 * this scene shows the visitor's actual sky, so it stays bright at noon even when
 * the site is in its night theme. It is a window, not a surface.
 */
.sky {
  --w-sky: #d6eef5;
  --w-haze: #e7f4f9;
  --w-ground: #b8e0c8;
  --w-ground-2: #9fd4b5;
  --w-sun: #f7e4a8;
  --w-moon: #fcf5d6;
  --w-cloud: #ffffff;
  --w-cloud-shade: #e2eef4;
  --w-rain: #79b5cd;
  --w-snow: #ffffff;
  --w-bolt: #e8b94d;
  --w-mist: #f2fafd;
  --w-star: #ffffff;

  /*
   * Fixed integer size, never a percentage.
   *
   * This is the one rule the whole illustration depends on. A 64-unit grid drawn
   * at 150px puts every edge on a fractional device pixel, and the browser
   * resolves that by anti-aliasing — which is `design.md`'s "never anti-alias
   * pixel artwork", arrived at accidentally. 128 and 192 are exactly 2x and 3x,
   * so every authored unit lands on whole pixels at any DPR.
   */
  width: 128px;
  height: 128px;
  flex: none;
  display: block;
  image-rendering: pixelated;
  border: 2px solid var(--border);
  background: var(--w-sky);
}

/* Square corners on purpose. A border-radius here would mask the corner pixels
   with an anti-aliased curve, which is the one thing the frame must not do. */

.sky--night {
  --w-sky: #223040;
  --w-haze: #2b3a4a;
  --w-ground: #23402f;
  --w-ground-2: #2e5540;
  --w-moon: #f4efd8;
  --w-cloud: #47586a;
  --w-cloud-shade: #384756;
  --w-rain: #86b9d0;
  --w-snow: #e9f3f8;
  --w-bolt: #efc862;
  --w-mist: #3d4e60;
  --w-star: #fff8e2;
}

@media (min-width: 768px) {
  .sky {
    width: 192px;
    height: 192px;
  }
}
</style>
