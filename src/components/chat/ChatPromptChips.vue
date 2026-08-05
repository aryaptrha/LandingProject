<script setup lang="ts">
interface Props {
  /** Disabled while a reply is in flight, so chips can't queue up requests. */
  disabled?: boolean
}

withDefaults(defineProps<Props>(), { disabled: false })

const emit = defineEmits<{
  send: [prompt: string]
}>()

const prompts = [
  { label: 'Siapa kamu?', text: 'Siapa kamu?' },
  { label: 'Project favorit kamu?', text: 'Project favorit kamu apa?' },
  { label: 'Belajar apa sekarang?', text: 'Sekarang kamu sedang belajar apa?' },
]
</script>

<template>
  <div class="prompt-chips">
    <p class="prompt-chips__hint">Bingung mau nanya apa? Coba ini:</p>
    <div class="prompt-chips__row">
      <button
        v-for="p in prompts"
        :key="p.label"
        class="prompt-chip"
        type="button"
        :disabled="disabled"
        @click="emit('send', p.text)"
      >
        {{ p.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt-chips {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 0 var(--space-md) var(--space-sm);
}

.prompt-chips__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-medium);
}

.prompt-chips__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

/* Chips stay solid — glass is reserved for surfaces, not controls. */
.prompt-chip {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: var(--space-sm) var(--space-md);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-dark);
  background: var(--blue-light);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-badge);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    background-color 0.18s ease,
    border-color 0.18s ease;
}

.prompt-chip:hover:not(:disabled) {
  background: var(--blue-main);
  border-color: var(--blue-main);
  transform: translateY(-1px) scale(1.02);
}

.prompt-chip:active:not(:disabled) {
  transform: translateY(0) scale(1);
}

.prompt-chip:focus-visible {
  outline: 2px solid var(--text-dark);
  outline-offset: 2px;
}

.prompt-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
