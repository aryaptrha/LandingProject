<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useChat } from '../../composables/useChat'
import { useMobilePanel } from '../../composables/useMobilePanels'
import { useRetroSound } from '../../composables/useRetroSound'
import TurnstileWidget from '../TurnstileWidget.vue'
import AryaPixelFace from './AryaPixelFace.vue'
import ChatHeader from './ChatHeader.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ChatAvatarPicker from './ChatAvatarPicker.vue'
import ChatPromptChips from './ChatPromptChips.vue'

const {
  messages,
  isLoading,
  sendMessage,
  stop,
  clearMessages,
  userAvatarId,
  isAvatarPickerOpen,
  setUserAvatar,
  openAvatarPicker,
  closeAvatarPicker,
  isSessionVerified,
  isVerifyingSession,
  sessionError,
  setSessionFromTurnstile,
} = useChat()

const { playPop, playToggle, playSuccess, playError } = useRetroSound()

const isOpen = ref(false)
const turnstileWidgetRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)

const popupEl = ref<HTMLElement | null>(null)
const launcherEl = ref<HTMLButtonElement | null>(null)

const { claim } = useMobilePanel('chat', () => {
  const losingFocus = popupEl.value?.contains(document.activeElement) === true
  isOpen.value = false
  if (losingFocus) launcherEl.value?.focus()
})

/** Only shown on a fresh conversation — the welcome message alone, nothing asked yet. */
const showPromptChips = computed(() => messages.value.length <= 1)

const isPickerShown = computed(() => isAvatarPickerOpen.value || !userAvatarId.value)

function toggleChat() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    playPop()
    claim()
  } else {
    playToggle()
  }
}

async function onTurnstileVerify(token: string) {
  const success = await setSessionFromTurnstile(token)
  if (success) {
    playSuccess()
  } else {
    playError()
    turnstileWidgetRef.value?.reset()
  }
}

function onTurnstileExpire() {
  turnstileWidgetRef.value?.reset()
}

function onTurnstileError() {
  turnstileWidgetRef.value?.reset()
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(): HTMLElement[] {
  const root = popupEl.value
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.classList.contains('focus-sentinel'),
  )
}

function focusFirst() {
  getFocusable()[0]?.focus()
}

function focusLast() {
  const focusables = getFocusable()
  focusables[focusables.length - 1]?.focus()
}

function onPopupKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (isPickerShown.value) return
  isOpen.value = false
}

watch(isOpen, async (open) => {
  if (open) {
    document.addEventListener('keydown', onPopupKeydown)
    await nextTick()
    if (!isPickerShown.value) {
      const first = getFocusable()[0]
      if (first) first.focus()
      else popupEl.value?.focus()
    }
  } else {
    document.removeEventListener('keydown', onPopupKeydown)
    if (popupEl.value?.contains(document.activeElement) === true) launcherEl.value?.focus()
  }
})

onBeforeUnmount(() => document.removeEventListener('keydown', onPopupKeydown))
</script>

<template>
  <div class="chat-widget">
    <!-- Floating Launcher Button -->
    <button
      ref="launcherEl"
      class="chat-launcher"
      :class="{ 'chat-launcher--active': isOpen }"
      @click="toggleChat"
      type="button"
      aria-label="Toggle Chat with Arya"
      :title="isOpen ? 'Close Chat' : 'Chat dengan Arya'"
      :aria-expanded="isOpen"
      :aria-controls="isOpen ? 'chat-popup' : undefined"
    >
      <div class="chat-launcher__avatar">
        <AryaPixelFace :size="22" />
      </div>
      <span class="chat-launcher__label">Chat Arya</span>
      <span class="chat-launcher__dot"></span>
    </button>

    <!-- Floating Chat Window -->
    <Transition name="chat-popup-anim">
      <section
        v-if="isOpen"
        id="chat-popup"
        ref="popupEl"
        class="chat-popup"
        role="dialog"
        aria-label="Chat Window with Arya"
        tabindex="-1"
      >
        <span class="focus-sentinel" tabindex="0" @focus="focusLast"></span>

        <!-- Header -->
        <ChatHeader
          :user-avatar-id="userAvatarId"
          @close="isOpen = false"
          @clear-chat="clearMessages"
          @open-avatar-picker="openAvatarPicker"
        />

        <!-- Avatar Picker Overlay -->
        <ChatAvatarPicker
          v-if="isPickerShown"
          :initial-avatar-id="userAvatarId || 'ironman'"
          @select="setUserAvatar"
          @dismiss="closeAvatarPicker"
        />

        <!-- Main Chat Area -->
        <template v-else>
          <!-- Message List -->
          <ChatMessageList
            :messages="messages"
            :is-loading="isLoading"
            :user-avatar-id="userAvatarId"
          />

          <!-- Security / Turnstile Verification Bar when session is not yet active -->
          <div v-if="!isSessionVerified" class="chat-turnstile-box">
            <div class="chat-turnstile-box__header">
              <span class="chat-turnstile-box__icon">🛡️</span>
              <span class="chat-turnstile-box__title">Verifikasi Keamanan Singkat</span>
            </div>
            <p class="chat-turnstile-box__desc">
              Selesaikan verifikasi Cloudflare di bawah ini untuk membuka sesi chat.
            </p>
            <div class="chat-turnstile-box__widget">
              <TurnstileWidget
                ref="turnstileWidgetRef"
                action="chat_session"
                theme="auto"
                size="flexible"
                @verify="onTurnstileVerify"
                @expire="onTurnstileExpire"
                @error="onTurnstileError"
              />
            </div>
            <p v-if="sessionError" class="chat-turnstile-box__error" role="alert">
              ⚠️ {{ sessionError }}
            </p>
            <p v-else-if="isVerifyingSession" class="chat-turnstile-box__status">
              ⏳ Memvalidasi sesi chat...
            </p>
          </div>

          <!-- Starter prompts, only before first question and once verified -->
          <ChatPromptChips
            v-if="showPromptChips && isSessionVerified"
            :disabled="isLoading"
            @send="sendMessage"
          />

          <!-- Input Bar -->
          <ChatInput
            :is-loading="isLoading"
            :disabled="!isSessionVerified"
            :placeholder="isSessionVerified ? 'Type a message...' : 'Verifikasi keamanan di atas untuk chat...'"
            @send="sendMessage"
            @stop="stop"
          />
        </template>

        <span class="focus-sentinel" tabindex="0" @focus="focusFirst"></span>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.chat-widget {
  position: relative;
  z-index: 1000;
}

/* Floating Launcher Button */
.chat-launcher {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 8px 8px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1.5px solid var(--border);
  border-radius: 30px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chat-launcher:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.12);
  border-color: var(--blue-main);
}

.chat-launcher:active {
  transform: translateY(0);
}

.chat-launcher__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--lavender-light);
  border-radius: 50%;
  overflow: hidden;
}

.focus-sentinel {
  position: absolute;
  width: 0;
  height: 0;
}

.chat-launcher__label {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-dark);
}

.chat-launcher__dot {
  width: 7px;
  height: 7px;
  background: var(--status-online);
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(52, 199, 89, 0.25);
}

/* Chat Popup Window */
.chat-popup {
  position: fixed;
  bottom: 72px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 360px;
  height: 500px;
  max-height: calc(85vh - 60px);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}

/* Turnstile Verification Box inside Chat */
.chat-turnstile-box {
  padding: 10px 14px;
  background: var(--bg-soft, #f8f9fa);
  border-top: 1px dashed var(--border);
  border-bottom: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.chat-turnstile-box__header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.chat-turnstile-box__icon {
  font-size: 0.95rem;
}

.chat-turnstile-box__title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-dark);
}

.chat-turnstile-box__desc {
  font-size: 0.76rem;
  color: var(--text-medium);
  margin: 0;
  line-height: 1.3;
}

.chat-turnstile-box__widget {
  min-height: 65px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
}

.chat-turnstile-box__error {
  margin: 0;
  font-size: 0.75rem;
  color: var(--status-offline, #e53e3e);
  font-weight: 600;
}

.chat-turnstile-box__status {
  margin: 0;
  font-size: 0.75rem;
  color: var(--blue-deep, #3182ce);
  font-style: italic;
}

@media (max-width: 480px) {
  .chat-popup {
    left: 10px;
    right: 10px;
    width: auto;
    bottom: 68px;
    height: calc(85vh - 50px);
  }

  .chat-launcher {
    left: 10px;
    bottom: 14px;
  }
}

/* Animations */
.chat-popup-anim-enter-active,
.chat-popup-anim-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.chat-popup-anim-enter-from,
.chat-popup-anim-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
</style>
