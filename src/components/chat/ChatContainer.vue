<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useChat } from '../../composables/useChat'
import { useMobilePanel } from '../../composables/useMobilePanels'
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
} = useChat()

const isOpen = ref(false)

const popupEl = ref<HTMLElement | null>(null)
const launcherEl = ref<HTMLButtonElement | null>(null)

/*
 * On a phone this popup and the edge status panel are both near-full-width bands at the
 * bottom of the screen, so only one of them can be open at a time. Nothing is lost when
 * this one is the one that gives way: the conversation lives in localStorage, so reopening
 * picks up exactly where it left off.
 *
 * Focus is the one thing that would be lost. The popup is unmounted, so focus anywhere
 * inside it — the input, most likely — would fall to `<body>` and drop the visitor at the
 * top of the page. The launcher is where it belongs anyway, being this dialog's opener.
 * Usually the tap that claimed the space has already taken focus elsewhere, in which case
 * this sits out and leaves it there.
 */
const { claim } = useMobilePanel('chat', () => {
  const losingFocus = popupEl.value?.contains(document.activeElement) === true
  isOpen.value = false
  if (losingFocus) launcherEl.value?.focus()
})

/** Only shown on a fresh conversation — the welcome message alone, nothing asked yet. */
const showPromptChips = computed(() => messages.value.length <= 1)

/*
 * The avatar picker overlays the popup on a fresh conversation (no avatar chosen yet) or
 * whenever the visitor reopens it to switch heroes. This mirrors the template's own
 * render condition for the picker, kept in one place so the Escape handler and the
 * focus-on-open below can both defer to the picker for exactly as long as it is on screen.
 */
const isPickerShown = computed(() => isAvatarPickerOpen.value || !userAvatarId.value)

function toggleChat() {
  isOpen.value = !isOpen.value
  // Only on the way open. Closing takes space from nobody.
  if (isOpen.value) claim()
}

/*
 * Dialog accessibility, following the music shell as the in-repo reference
 * (MusicPlayerWidget for the launcher's aria state, MusicPlayerDrawer for the
 * mount-scoped Escape listener): the launcher advertises open/closed, focus moves into
 * the popup on open and back to the launcher on close, Tab is trapped inside the open
 * dialog, and Escape closes it. Unlike the music drawer — a component that mounts and
 * unmounts with its own open state — this popup is a `v-if` block in this same file, so
 * the keydown listener is bound and torn down by watching `isOpen` rather than by a
 * child's lifecycle hooks. Either way the listener lives only while the popup is open.
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusable(): HTMLElement[] {
  const root = popupEl.value
  if (!root) return []
  // The sentinels carry tabindex="0" themselves; they exist to catch a wrap, not to be
  // wrap targets, so they are filtered back out of the real tab order here.
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
  // The avatar picker owns Escape while it is on screen (it dismisses itself via
  // @dismiss). One Escape press must never both dismiss the picker and close the chat,
  // so the shell stands down for the whole time the picker is shown — not only when it
  // was opened deliberately, but on the mandatory first-visit pass too.
  if (isPickerShown.value) return
  isOpen.value = false
}

watch(isOpen, async (open) => {
  if (open) {
    document.addEventListener('keydown', onPopupKeydown)
    await nextTick()
    // The picker manages its own focus-on-open (it mounts inside the popup), so the shell
    // only reaches for focus when the main chat is what came up — otherwise the two would
    // both grab the first focus and race.
    if (!isPickerShown.value) {
      const first = getFocusable()[0]
      if (first) first.focus()
      else popupEl.value?.focus()
    }
  } else {
    document.removeEventListener('keydown', onPopupKeydown)
    // Return focus to the launcher, but only when it still sits inside the closing popup
    // — the same guard the mobile force-close above applies, so a close that already
    // moved focus elsewhere (or that closer, which restores focus itself) is left alone
    // and nothing gains a ring it didn't have.
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
        <!-- Focus-trap sentinel: a Shift+Tab off the first control lands here and is
             bounced to the last, keeping Tab inside the open dialog. Paired with the one
             just before the closing tag. -->
        <span class="focus-sentinel" tabindex="0" @focus="focusLast"></span>

        <!-- Header -->
        <ChatHeader
          :user-avatar-id="userAvatarId"
          @close="isOpen = false"
          @clear-chat="clearMessages"
          @open-avatar-picker="openAvatarPicker"
        />

        <!-- Avatar Picker Overlay (shows when first starting chat or when user wants to change avatar) -->
        <ChatAvatarPicker
          v-if="isPickerShown"
          :initial-avatar-id="userAvatarId || 'ironman'"
          @select="setUserAvatar"
          @dismiss="closeAvatarPicker"
        />

        <!-- Main Chat Area (shown after avatar selection) -->
        <template v-else>
          <!-- Message List -->
          <ChatMessageList
            :messages="messages"
            :is-loading="isLoading"
            :user-avatar-id="userAvatarId"
          />

          <!-- Starter prompts, only before the first question -->
          <ChatPromptChips
            v-if="showPromptChips"
            :disabled="isLoading"
            @send="sendMessage"
          />

          <!-- Input Bar -->
          <ChatInput
            :is-loading="isLoading"
            @send="sendMessage"
            @stop="stop"
          />
        </template>

        <!-- Focus-trap sentinel: a Tab off the last control lands here and is bounced
             back to the first. -->
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

/* Focus-trap sentinels: empty and out of flow, so they never affect the popup's flex
   layout, and they only ever hold focus for the instant their @focus handler takes to
   bounce it to the opposite end of the dialog — so no focus ring is ever painted. */
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
