<script setup lang="ts">
/*
 * The hand-authored Arya pixel face used to live verbatim in three places — the floating
 * launcher (ChatContainer), the popup header (ChatHeader) and the assistant message avatar
 * (ChatMessageItem). This is the single source for it.
 *
 * The only real difference between the three copies was size, so that is a prop. The header
 * copy additionally painted one extra near-white rect for the shirt collar on top of the
 * green body; that is the sole reason `variant: 'collar'` exists. Everything else is byte-for-
 * byte identical, so keep the fills as literal hex — they are pixel-art colours off the
 * palette by design (matching the sibling AvengerPixelAvatar), not themeable tokens.
 *
 * The face is decorative in all three call sites; the surrounding text ("Arya", "Chat Arya",
 * the sender label) carries the meaning, so the SVG is aria-hidden.
 */
withDefaults(
  defineProps<{
    // All three consumers pass an explicit size (22 / 24 / 28), so this default is only a
    // fallback; 32 mirrors AvengerPixelAvatar's own default.
    size?: number
    variant?: 'plain' | 'collar'
  }>(),
  {
    size: 32,
    variant: 'plain',
  },
)
</script>

<template>
  <svg
    viewBox="0 0 16 16"
    :width="size"
    :height="size"
    class="pixel-art"
    aria-hidden="true"
  >
    <rect width="16" height="16" fill="#D9C8F1" rx="3" />
    <rect x="3" y="2" width="10" height="3" fill="#2F2F2F" />
    <rect x="2" y="4" width="2" height="4" fill="#2F2F2F" />
    <rect x="12" y="4" width="2" height="4" fill="#2F2F2F" />
    <rect x="4" y="5" width="8" height="6" fill="#FFE0BD" />
    <rect x="5" y="7" width="1" height="2" fill="#2F2F2F" />
    <rect x="10" y="7" width="1" height="2" fill="#2F2F2F" />
    <rect x="4" y="9" width="1" height="1" fill="#F6C6D3" />
    <rect x="11" y="9" width="1" height="1" fill="#F6C6D3" />
    <rect x="7" y="10" width="2" height="1" fill="#D27D7D" />
    <rect x="3" y="11" width="10" height="4" fill="#B8E0C8" />
    <!-- Collar sits last so it paints over the green body, exactly as the header copy did. -->
    <rect v-if="variant === 'collar'" x="6" y="11" width="4" height="2" fill="#FAFAF7" />
  </svg>
</template>

<style scoped>
.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
