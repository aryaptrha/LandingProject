<template>
  <svg
    class="pixel-art"
    viewBox="0 0 16 16"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Right-pointing triangle stepped in 2px columns. Every rect centres on y=8,
         the middle of the 16-unit viewBox, so it sits level with IconPause. -->
    <rect x="4" y="2" width="2" height="12" fill="currentColor" />
    <rect x="6" y="4" width="2" height="8" fill="currentColor" />
    <rect x="8" y="6" width="2" height="4" fill="currentColor" />
    <rect x="10" y="7" width="2" height="2" fill="currentColor" />
  </svg>
</template>

<style scoped>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}
</style>
