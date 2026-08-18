<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{
    minHeight?: string
    rootMargin?: string
    title?: string
  }>(),
  {
    minHeight: '260px',
    rootMargin: '250px 0px',
    title: '',
  }
)

const isIntersected = ref(false)
const targetRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  // If IntersectionObserver is unavailable, load immediately
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    isIntersected.value = true
    return
  }

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) {
        isIntersected.value = true
        if (observer) {
          observer.disconnect()
          observer = null
        }
      }
    },
    {
      rootMargin: props.rootMargin,
    }
  )

  if (targetRef.value) {
    observer.observe(targetRef.value)
  }
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <div
    ref="targetRef"
    class="lazy-section"
    :style="{ minHeight }"
  >
    <Suspense v-if="isIntersected">
      <template #default>
        <slot />
      </template>
      <template #fallback>
        <div
          class="lazy-section__skeleton"
          :style="{ minHeight }"
          aria-hidden="true"
        >
          <div v-if="title" class="skeleton-header">
            <div class="skeleton-pill skeleton-shimmer"></div>
            <span class="skeleton-label">{{ title }}</span>
          </div>
          <div class="skeleton-body skeleton-shimmer"></div>
        </div>
      </template>
    </Suspense>
    <div
      v-else
      class="lazy-section__skeleton"
      :style="{ minHeight }"
      aria-hidden="true"
    >
      <div v-if="title" class="skeleton-header">
        <div class="skeleton-pill skeleton-shimmer"></div>
        <span class="skeleton-label">{{ title }}</span>
      </div>
      <div class="skeleton-body skeleton-shimmer"></div>
    </div>
  </div>
</template>

<style scoped>
.lazy-section {
  width: 100%;
  content-visibility: auto;
  contain-intrinsic-size: auto v-bind(minHeight);
}

.lazy-section__skeleton {
  width: 100%;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--surface-translucent);
  backdrop-filter: blur(12px);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  box-sizing: border-box;
}

.skeleton-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.skeleton-pill {
  width: 32px;
  height: 20px;
  border-radius: var(--radius-sm);
  background: var(--surface-muted);
}

.skeleton-label {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.1rem;
  color: var(--text-medium);
  opacity: 0.7;
}

.skeleton-body {
  flex: 1;
  width: 100%;
  min-height: 140px;
  border-radius: var(--radius-md);
  background: var(--surface-muted);
}

.skeleton-shimmer {
  position: relative;
  overflow: hidden;
}

.skeleton-shimmer::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.25) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  animation: shimmer 1.5s infinite;
}

[data-theme='night'] .skeleton-shimmer::after {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0) 100%
  );
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer::after {
    animation: none;
  }
}
</style>
