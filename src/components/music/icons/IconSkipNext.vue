<template>
  <svg
    class="pixel-art"
    viewBox="0 0 16 16"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Triangle then stop bar. Mirror of IconSkipPrev. -->
    <rect x="3" y="3" width="2" height="10" fill="currentColor" />
    <rect x="5" y="5" width="2" height="6" fill="currentColor" />
    <rect x="7" y="7" width="2" height="2" fill="currentColor" />
    <rect x="10" y="3" width="2" height="10" fill="currentColor" />
  </svg>
</template>

<style scoped>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}
</style>
