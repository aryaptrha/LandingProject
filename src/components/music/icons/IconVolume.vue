<template>
  <svg
    class="pixel-art"
    viewBox="0 0 16 16"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Speaker cone stepped outward, then two sound arcs. -->
    <rect x="2" y="6" width="2" height="4" fill="currentColor" />
    <rect x="4" y="4" width="2" height="8" fill="currentColor" />
    <rect x="6" y="2" width="2" height="12" fill="currentColor" />
    <rect x="10" y="6" width="1" height="4" fill="currentColor" />
    <rect x="12" y="4" width="1" height="8" fill="currentColor" />
  </svg>
</template>

<style scoped>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}
</style>
