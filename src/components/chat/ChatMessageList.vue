<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { ChatMessage } from '../../composables/useChat'
import ChatMessageItem from './ChatMessageItem.vue'

const props = defineProps<{
  messages: ChatMessage[]
  isLoading: boolean
  userAvatarId?: string
}>()

const listRef = ref<HTMLElement | null>(null)

/** Distance from the bottom that still counts as "following the conversation". */
const STICK_THRESHOLD_PX = 60

function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
}

/**
 * Whether the reader is parked at the bottom. Watchers flush before the DOM
 * updates, so this measures the position from *before* the new content landed —
 * which is the question we actually want answered.
 */
function isNearBottom(): boolean {
  const el = listRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX
}

/* -------------------------------------------------------------------------- */
/* C4 — "scroll to latest" affordance                                         */
/* -------------------------------------------------------------------------- */

// The reader's position, kept as reactive state so the jump pill can react to it.
// This is fed by a passive scroll listener (see onMounted) — NOT by content
// growth, because a stream appends tokens without ever firing a scroll event, so
// the auto-follow watchers below still read the DOM live via isNearBottom().
const isAtBottom = ref(true)
// Set when fresh streamed text lands while the reader has scrolled away. The pill
// only earns its place when BOTH are true: scrolling up through history with
// nothing new arriving shouldn't nag the reader with a jump button.
const hasNewContentBelow = ref(false)
const showJumpButton = computed(() => !isAtBottom.value && hasNewContentBelow.value)

function handleScroll() {
  isAtBottom.value = isNearBottom()
  // Reaching the bottom means the reader has caught up: drop the flag and re-arm
  // auto-follow so the next token sticks again.
  if (isAtBottom.value) hasNewContentBelow.value = false
}

function scrollIfFollowing() {
  if (isNearBottom()) {
    scrollToBottom()
  } else {
    // A reply is still streaming in below the fold while the reader is scrolled up.
    // Surface the pill instead of yanking the viewport out from under them.
    hasNewContentBelow.value = true
  }
}

function jumpToLatest() {
  scrollToBottom()
  // Re-arm optimistically so the pill leaves immediately rather than lingering
  // through the smooth scroll; the scroll event it triggers then confirms the state.
  isAtBottom.value = true
  hasNewContentBelow.value = false
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.isLoading, scrollToBottom)

// A streamed reply grows the last message in place, so the array length never
// changes and neither watcher above fires — the text would run off the bottom
// until the stream ended. Follow it token by token, but only while the reader
// hasn't scrolled up, so re-reading earlier messages isn't fought.
watch(() => props.messages[props.messages.length - 1]?.content, scrollIfFollowing)

/* -------------------------------------------------------------------------- */
/* C3 — announce completed assistant replies to assistive tech                */
/* -------------------------------------------------------------------------- */

// The live region is deliberately NOT on the scrolling list. During a stream the
// last message's text grows token-by-token; an aria-live region wrapping the list
// would re-announce the whole (ever-changing) conversation on every token — a
// screen-reader firehose. Instead we announce each assistant message exactly ONCE,
// the moment it finishes: when its status flips from 'sending' to 'sent'.
const announcement = ref('')

// Previously-observed status per message id, so we fire only on the genuine
// sending -> sent completion edge. This also means history restored from
// localStorage is never announced: those messages arrive already 'sent' and their
// prior status was never seen as 'sending'.
const seenStatus = new Map<string, ChatMessage['status']>()

watch(
  // Watch a lightweight id:status signature rather than the messages themselves, so
  // streamed content changes (which don't touch status) never wake this watcher.
  () => props.messages.map((m) => `${m.id}:${m.status ?? ''}`).join('|'),
  () => {
    for (const m of props.messages) {
      const prev = seenStatus.get(m.id)
      seenStatus.set(m.id, m.status)
      if (m.role === 'assistant' && prev === 'sending' && m.status === 'sent') {
        // Replace rather than append; the polite region reads the new value on change.
        announcement.value = m.content
      }
    }
  },
)

/* -------------------------------------------------------------------------- */

// Capture the scroll target at mount so we can always detach the passive listener
// on unmount, even if the template ref has already been nulled by then.
let scrollTarget: HTMLElement | null = null

onMounted(() => {
  scrollToBottom()
  scrollTarget = listRef.value
  scrollTarget?.addEventListener('scroll', handleScroll, { passive: true })
})

onBeforeUnmount(() => {
  scrollTarget?.removeEventListener('scroll', handleScroll)
  scrollTarget = null
})
</script>

<template>
  <div class="chat-list-wrapper">
    <!-- Messages List -->
    <div class="chat-list" ref="listRef">
      <ChatMessageItem
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :user-avatar-id="userAvatarId"
      />
    </div>

    <!-- C4: jump-to-latest pill. A button, so solid (not glass) per design.md; only
         shown when the reader has scrolled away AND fresh text has landed below. -->
    <Transition name="jump-fade">
      <button
        v-if="showJumpButton"
        type="button"
        class="jump-to-latest"
        aria-label="Lihat pesan terbaru"
        title="Lihat pesan terbaru"
        @click="jumpToLatest"
      >
        <svg
          class="pixel-art"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3" y="5" width="2" height="2" fill="currentColor" />
          <rect x="11" y="5" width="2" height="2" fill="currentColor" />
          <rect x="5" y="7" width="2" height="2" fill="currentColor" />
          <rect x="9" y="7" width="2" height="2" fill="currentColor" />
          <rect x="7" y="9" width="2" height="2" fill="currentColor" />
        </svg>
        <span class="jump-to-latest__label">Pesan terbaru</span>
      </button>
    </Transition>

    <!-- C3 live region: see the watcher above for why announcements are per completed
         message and this sits outside the scrolling list. Clip-based sr-only keeps the
         text in the accessibility tree (display:none / visibility:hidden would drop it). -->
    <div class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
  </div>
</template>

<style scoped>
/* New root: a positioning context for the jump pill, sized exactly like the scroll
   area used to be so the surrounding flex layout in ChatContainer is unchanged. */
.chat-list-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.chat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  background: var(--bg-soft);
  scroll-behavior: smooth;
}

/* Custom thin scrollbar */
.chat-list::-webkit-scrollbar {
  width: 5px;
}

.chat-list::-webkit-scrollbar-track {
  background: transparent;
}

.chat-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

.chat-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Jump-to-latest pill. Solid pastel fill + dark text (the primary-button recipe in
   design.md), pill radius, and a 44px min hit area. Centred with auto margins rather
   than a transform translate so the enter/leave transition owns `transform`. */
.jump-to-latest {
  position: absolute;
  bottom: var(--space-md);
  left: 0;
  right: 0;
  margin-inline: auto;
  width: fit-content;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  min-height: 44px;
  padding: var(--space-xs) var(--space-md);
  background: var(--blue-main);
  color: var(--text-dark);
  border: 1px solid var(--blue-deep);
  border-radius: var(--radius-badge);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
  font-family: 'Nunito', sans-serif;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.jump-to-latest:hover {
  background: var(--blue-deep);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.jump-to-latest:active {
  transform: translateY(0);
}

.jump-to-latest:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.jump-to-latest__label {
  line-height: 1;
}

.pixel-art {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  shape-rendering: crispEdges;
}

/* Fade + slight lift, inside the 150-200ms budget. The global prefers-reduced-motion
   rule in base.css collapses the duration for readers who ask for less motion. */
.jump-fade-enter-active,
.jump-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.jump-fade-enter-from,
.jump-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* Clip-based visually-hidden: stays in the accessibility tree (unlike display:none
   or visibility:hidden) so the aria-live region can still be announced. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
