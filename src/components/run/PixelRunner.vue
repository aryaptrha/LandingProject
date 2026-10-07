<script setup lang="ts">
/**
 * Hand-authored 32x32 runner, `<rect>` only, drawn on a 16-unit grid at 2px a unit.
 *
 * Two frames — mid-stride and passing — swapped with a `steps()` animation, so the
 * sprite changes pose in whole frames and never renders between them. That is the
 * pixel-art version of motion: a flipbook, not a tween. Nothing translates, so no
 * frame can land off-grid either.
 *
 * Fills are literal hex, like the icons in `components/icons`: this is an
 * illustration, and the night palette deliberately leaves illustrations alone.
 */

interface Pixel {
  x: number
  y: number
  w?: number
  h?: number
  fill: string
}

const SKIN = '#F7E4A8'
const INK = '#2F2F2F'
const SHIRT = '#F6C6D3'
const SHORTS = '#A9D6E5'
const TRACK = '#D8D8D8'

/** Head, shirt and shorts: identical in both frames. */
const BODY: Pixel[] = [
  { x: 7, y: 1, w: 3, h: 3, fill: SKIN },
  { x: 7, y: 1, w: 3, h: 1, fill: INK },
  { x: 9, y: 2, fill: INK },
  { x: 6, y: 4, w: 3, h: 4, fill: SHIRT },
  { x: 6, y: 8, w: 3, h: 2, fill: SHORTS },
]

/** Mid-stride: front arm up, back leg kicked out behind. */
const STRIDE: Pixel[] = [
  { x: 9, y: 5, w: 2, h: 1, fill: SKIN },
  { x: 11, y: 4, fill: SKIN },
  { x: 5, y: 5, fill: SKIN },
  { x: 4, y: 6, w: 1, h: 2, fill: SKIN },
  { x: 8, y: 10, fill: SKIN },
  { x: 9, y: 11, fill: SKIN },
  { x: 10, y: 12, fill: SKIN },
  { x: 10, y: 13, w: 2, h: 1, fill: INK },
  { x: 6, y: 10, fill: SKIN },
  { x: 5, y: 11, w: 2, h: 1, fill: SKIN },
  { x: 3, y: 10, w: 2, h: 1, fill: INK },
  { x: 4, y: 11, fill: SKIN },
]

/** Passing: arms down, legs gathered under the body. */
const PASSING: Pixel[] = [
  { x: 9, y: 5, w: 1, h: 2, fill: SKIN },
  { x: 5, y: 5, w: 1, h: 2, fill: SKIN },
  { x: 7, y: 10, w: 1, h: 3, fill: SKIN },
  { x: 7, y: 13, w: 2, h: 1, fill: INK },
  { x: 6, y: 10, w: 1, h: 2, fill: SKIN },
  { x: 5, y: 12, w: 1, h: 1, fill: SKIN },
  { x: 4, y: 12, w: 1, h: 1, fill: INK },
]

/** Dashed track under the feet. */
const GROUND: Pixel[] = [1, 4, 7, 10, 13].map((x) => ({ x, y: 15, w: 2, h: 1, fill: TRACK }))
</script>

<template>
  <svg
    class="runner"
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      v-for="(px, i) in GROUND"
      :key="`g${i}`"
      :x="px.x * 2"
      :y="px.y * 2"
      :width="(px.w ?? 1) * 2"
      :height="(px.h ?? 1) * 2"
      :fill="px.fill"
    />
    <rect
      v-for="(px, i) in BODY"
      :key="`b${i}`"
      :x="px.x * 2"
      :y="px.y * 2"
      :width="(px.w ?? 1) * 2"
      :height="(px.h ?? 1) * 2"
      :fill="px.fill"
    />
    <g class="runner__frame runner__frame--a">
      <rect
        v-for="(px, i) in STRIDE"
        :key="`s${i}`"
        :x="px.x * 2"
        :y="px.y * 2"
        :width="(px.w ?? 1) * 2"
        :height="(px.h ?? 1) * 2"
        :fill="px.fill"
      />
    </g>
    <g class="runner__frame runner__frame--b">
      <rect
        v-for="(px, i) in PASSING"
        :key="`p${i}`"
        :x="px.x * 2"
        :y="px.y * 2"
        :width="(px.w ?? 1) * 2"
        :height="(px.h ?? 1) * 2"
        :fill="px.fill"
      />
    </g>
  </svg>
</template>

<style scoped>
.runner {
  display: block;
  flex-shrink: 0;
  image-rendering: pixelated;
  shape-rendering: crispEdges;
}

/*
 * One 400ms cycle, two 200ms frames — each pose holds for exactly the design.md
 * motion ceiling. `steps(1, end)` holds each keyframe's value for its whole
 * interval, so a frame is either fully shown or fully gone; frame B runs half a
 * cycle behind A, which makes the two alternate.
 *
 * Frame B is hidden by default rather than by the animation, so the static pose
 * (reduced motion, below) is a complete runner rather than two overlapping ones.
 */
.runner__frame {
  animation: runner-flip 400ms steps(1, end) infinite;
}

.runner__frame--b {
  opacity: 0;
  animation-delay: -200ms;
}

@keyframes runner-flip {
  0% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

/*
 * base.css collapses every animation to one 0.01ms run under reduced motion, which
 * would end with both frames back at their resting opacity. Named off here instead,
 * like the loops in motion.css, so the runner simply stands mid-stride.
 */
@media (prefers-reduced-motion: reduce) {
  .runner__frame {
    animation: none;
  }
}
</style>
