<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { ChatMessage } from '../../composables/useChat'
import AvengerPixelAvatar from './AvengerPixelAvatar.vue'
import AryaPixelFace from './AryaPixelFace.vue'
import { renderMarkdown } from '../../utils/markdown'

const props = defineProps<{
  message: ChatMessage
  userAvatarId?: string
}>()

/*
 * Assistant content rendered through the shared Markdown renderer (computed so it
 * only re-runs when the streamed content changes, not on every parent re-render).
 *
 * SECURITY: renderMarkdown HTML-escapes the entire string before emitting any
 * markup, so the `v-html` in the template can only ever inject tags this app
 * authored from a fixed allowlist. Do not point that v-html at any string that
 * has not passed through renderMarkdown.
 */
const renderedContent = computed(() => renderMarkdown(props.message.content))

/*
 * `message.timestamp` is an ISO 8601 instant for messages created by the current
 * build; it is formatted for display only here. MIGRATION: messages persisted by
 * older builds hold a pre-formatted locale string like "14:32", which is not
 * valid ISO — so when Date parsing fails, show the stored value verbatim rather
 * than "Invalid Date".
 */
const displayTime = computed(() => {
  const ts = props.message.timestamp
  const parsed = new Date(ts)
  if (Number.isNaN(parsed.getTime())) return ts
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const isCopied = ref(false)
// Held so it can be cancelled on unmount — clearing the chat tears down message
// items mid-timeout, and a stray callback would touch a disposed component.
let copyResetTimer: ReturnType<typeof setTimeout> | undefined

async function copyContent() {
  if (!props.message.content) return
  try {
    await navigator.clipboard.writeText(props.message.content)
  } catch {
    // writeText rejects on denied permission or a non-secure origin (where the
    // async Clipboard API is unavailable entirely). Never flip to the "Copied!"
    // state on failure — a false confirmation is worse than no feedback.
    return
  }
  isCopied.value = true
  if (copyResetTimer !== undefined) clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    isCopied.value = false
    copyResetTimer = undefined
  }, 1800)
}

onUnmounted(() => {
  if (copyResetTimer !== undefined) clearTimeout(copyResetTimer)
})
</script>

<template>
  <div
    class="message-item"
    :class="{
      'message-item--user': message.role === 'user',
      'message-item--assistant': message.role === 'assistant',
      'message-item--error': message.status === 'error',
    }"
  >
    <!-- Avatar -->
    <div class="message-item__avatar" :title="message.role === 'user' ? 'You' : 'Arya'">
      <!-- Assistant Pixel Avatar (shared face component; see AryaPixelFace.vue) -->
      <AryaPixelFace v-if="message.role === 'assistant'" :size="24" />

      <!-- User Pixel Avatar -->
      <AvengerPixelAvatar
        v-else-if="userAvatarId"
        :avatar-id="userAvatarId"
        :size="24"
      />
      <svg v-else viewBox="0 0 16 16" width="24" height="24" class="pixel-art">
        <rect width="16" height="16" fill="#A9D6E5" rx="3" />
        <rect x="4" y="2" width="8" height="3" fill="#4B6B94" />
        <rect x="4" y="5" width="8" height="6" fill="#FDE2D1" />
        <rect x="5" y="7" width="2" height="2" fill="#2F2F2F" />
        <rect x="9" y="7" width="2" height="2" fill="#2F2F2F" />
        <rect x="7" y="10" width="2" height="1" fill="#4B6B94" />
        <rect x="3" y="12" width="10" height="4" fill="#F7E4A8" />
      </svg>
    </div>

    <!-- Bubble Wrapper -->
    <div class="message-item__body">
      <div class="message-item__meta">
        <span class="message-item__sender">
          {{ message.role === 'user' ? 'You' : 'Arya' }}
        </span>
        <span class="message-item__time">{{ displayTime }}</span>
      </div>

      <!-- Bubble Content -->
      <div class="message-item__bubble">
        <!-- Typing / Loading indicator when waiting for endpoint response -->
        <div v-if="message.status === 'sending' && !message.content" class="typing-wrapper">
          <div class="typing-indicator">
            <span class="typing-text">Arya lagi ngetik...</span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>

          <!-- Awkward notification for free tier delay after 2 minutes -->
          <div v-if="message.isSlow" class="awkward-notice" role="alert">
            <span class="awkward-notice__emoji">😅</span>
            <span class="awkward-notice__text">Maaf yah saya pengguna free tier jadi ada aja masalah begini</span>
          </div>
        </div>

        <!-- Normal message text, rendered once through the shared Markdown
             renderer. SECURITY: renderMarkdown escapes the whole string before
             emitting any markup, so this v-html can only inject tags built from
             a fixed allowlist. Never point it at input that skips renderMarkdown. -->
        <div v-else class="message-item__text" v-html="renderedContent"></div>
      </div>

      <!-- Copy button (assistant messages only — user text is the visitor's own,
           so there is nothing to copy back). It lives below the bubble, in the
           body flow, so it can carry a full 44x44 hit area without overlapping
           the message text. -->
      <button
        v-if="message.role === 'assistant' && message.content && message.status !== 'sending'"
        type="button"
        class="message-item__copy-btn"
        aria-label="Copy response"
        :title="isCopied ? 'Copied!' : 'Copy response'"
        @click="copyContent"
      >
        <span v-if="isCopied" class="copy-badge" aria-hidden="true">Copied!</span>
        <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
          <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
          <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
        </svg>
        <!-- Persistent polite live region: present before the copy happens, so a
             successful copy is announced to assistive tech, not merely shown. -->
        <span class="sr-only" role="status" aria-live="polite">{{ isCopied ? 'Response copied to clipboard' : '' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  gap: var(--space-sm);
  max-width: 85%;
  margin-bottom: var(--space-md);
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-item--user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.message-item--assistant {
  margin-right: auto;
}

.message-item__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.message-item__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-item--user .message-item__body {
  align-items: flex-end;
}

.message-item__meta {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 0.75rem;
  color: var(--text-medium);
}

.message-item__sender {
  font-weight: 600;
}

.message-item__time {
  opacity: 0.7;
}

.message-item__bubble {
  position: relative;
  padding: 10px 14px;
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-dark);
  word-break: break-word;
  transition: all 0.15s ease;
}

.message-item--assistant .message-item__bubble {
  background: var(--surface-sunken);
  border: 1px solid rgba(217, 200, 241, 0.7);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border-radius: 18px 18px 18px 4px;
}

.message-item--user .message-item__bubble {
  background: var(--blue-light);
  border: 1px solid var(--blue-main);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  border-radius: 18px 18px 4px 18px;
}

.message-item--error .message-item__bubble {
  background: var(--pink-light);
  border-color: var(--pink-main);
  color: var(--status-error);
}

.message-item__text p {
  margin: 0 0 4px 0;
}

.message-item__text p:last-child {
  margin-bottom: 0;
}

.message-item__copy-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  /* 44x44 minimum hit area (design.md accessibility) even though the glyph is
     small — the target grows via min-size, the icon itself does not. */
  min-width: 44px;
  min-height: 44px;
  padding: var(--space-xs) var(--space-sm);
  background: transparent;
  border: none;
  border-radius: var(--radius-btn);
  font-size: 0.7rem;
  /* Low emphasis but always present. It used to be opacity:0 until the bubble
     was hovered, which put it out of reach of keyboard and touch entirely. */
  color: var(--text-medium);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
}

.message-item__copy-btn:hover {
  transform: translateY(-1px);
  color: var(--text-dark);
  background: var(--surface-muted);
}

.message-item__copy-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  color: var(--text-dark);
}

.copy-badge {
  color: var(--status-success-text);
  font-weight: 600;
}

/* Screen-reader-only helper — this project has no global utility for it. Used by
   the copy button's polite live region so a successful copy is announced. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Rendered-Markdown elements arrive via v-html (renderMarkdown), so they carry
   no scoped-style attribute — they must be reached through :deep(). */
.message-item__text :deep(a) {
  /* Colour AND underline: a link is never signalled by colour alone (design.md). */
  color: var(--select-ring);
  text-decoration: underline;
}

.message-item__text :deep(a):hover {
  color: var(--select-ring-hover);
}

.message-item__text :deep(.inline-code) {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85em;
  padding: 0 var(--space-xs);
  background: var(--surface-muted);
  border-radius: var(--radius-badge);
  color: var(--code-text);
}

.message-item__text :deep(.code-block) {
  margin: var(--space-xs) 0;
  padding: var(--space-sm);
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  /* Long code lines scroll inside the bubble rather than widening the chat. */
  overflow-x: auto;
}

.message-item__text :deep(.code-block) code {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85em;
  white-space: pre;
}

.message-item__text :deep(ul),
.message-item__text :deep(ol) {
  margin: var(--space-xs) 0;
  padding-left: var(--space-lg);
}

/* The global reset in base.css zeroes every margin, so without this two paragraphs
   from renderMarkdown would butt together and read as one block — losing the only
   difference between a paragraph break and a hard line break. Scoped to `p + p` so
   the single-paragraph case (almost every message) keeps its exact current spacing. */
.message-item__text :deep(p + p) {
  margin-top: var(--space-sm);
}

/* Typing indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
}

.typing-text {
  font-size: 0.85rem;
  color: var(--text-medium);
  font-style: italic;
}

/*
 * Blink, not bounce. `design.md` rules out bouncing outright, and a stepped
 * on/off blink is also the more honest gesture for this project: it is what a
 * sprite would do, where a translateY hop is what a web loader does. `steps(1,
 * end)` is what makes it a hard switch instead of a fade — no interpolation
 * between the two opacities at all.
 *
 * The three dots keep their staggered delays below, so they blink in sequence
 * and the group still reads as "working".
 */
.typing-indicator .dot {
  width: 6px;
  height: 6px;
  background: var(--lavender-main);
  border-radius: 50%;
  animation: typingBlink 1.2s steps(1, end) infinite;
}

.typing-indicator .dot:nth-child(2) {
  animation-delay: 0.2s;
  background: var(--blue-main);
}

.typing-indicator .dot:nth-child(3) {
  animation-delay: 0.4s;
  background: var(--green-main);
}

@keyframes typingBlink {
  0%,
  100% {
    opacity: 0.3;
  }
  40% {
    opacity: 1;
  }
}

.typing-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.awkward-notice {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  background: var(--yellow-light, #FCF5D6);
  border: 1px solid var(--yellow-main, #F7E4A8);
  border-radius: 10px;
  font-size: 0.8rem;
  color: var(--text-dark, #2F2F2F);
  animation: fadeIn 0.2s ease-out;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.awkward-notice__emoji {
  font-size: 1rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.awkward-notice__text {
  font-weight: 600;
  line-height: 1.35;
}
</style>
