<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'
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

function scrollIfFollowing() {
  if (isNearBottom()) scrollToBottom()
}

watch(() => props.messages.length, scrollToBottom)
watch(() => props.isLoading, scrollToBottom)

// A streamed reply grows the last message in place, so the array length never
// changes and neither watcher above fires — the text would run off the bottom
// until the stream ended. Follow it token by token, but only while the reader
// hasn't scrolled up, so re-reading earlier messages isn't fought.
watch(() => props.messages[props.messages.length - 1]?.content, scrollIfFollowing)

onMounted(scrollToBottom)
</script>

<template>
  <div class="chat-list" ref="listRef">
    <!-- Messages List -->
    <ChatMessageItem
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
      :user-avatar-id="userAvatarId"
    />
  </div>
</template>

<style scoped>
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
</style>
