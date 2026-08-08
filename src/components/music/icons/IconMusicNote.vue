<template>
  <svg
    class="pixel-art"
    viewBox="0 0 16 16"
    width="24"
    height="24"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Eighth note: head, stem, flag. Every rect lands on the 16px lattice. -->
    <rect x="3" y="10" width="5" height="3" fill="currentColor" />
    <rect x="8" y="3" width="2" height="8" fill="currentColor" />
    <rect x="10" y="2" width="3" height="2" fill="currentColor" />
  </svg>
</template>

<style scoped>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}
</style>
