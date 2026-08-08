<template>
  <svg
    class="pixel-art"
    viewBox="0 0 16 16"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Same cone as IconVolume so the pair reads as one state change... -->
    <rect x="2" y="6" width="2" height="4" fill="currentColor" />
    <rect x="4" y="4" width="2" height="8" fill="currentColor" />
    <rect x="6" y="2" width="2" height="12" fill="currentColor" />
    <!-- ...with the arcs replaced by a 4x4 cross, so mute is legible without colour.
         Rows 6–9 put the cross's centre on y=8, which is both the cone's centre and
         the span of IconVolume's inner arc. A unit higher — the obvious-looking 5–8
         — and the glyph jumps 1.5px every time mute is toggled. -->
    <rect x="10" y="6" width="1" height="1" fill="currentColor" />
    <rect x="13" y="6" width="1" height="1" fill="currentColor" />
    <rect x="11" y="7" width="2" height="1" fill="currentColor" />
    <rect x="11" y="8" width="2" height="1" fill="currentColor" />
    <rect x="10" y="9" width="1" height="1" fill="currentColor" />
    <rect x="13" y="9" width="1" height="1" fill="currentColor" />
  </svg>
</template>

<style scoped>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}
</style>
