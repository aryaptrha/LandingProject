<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AvengerPixelAvatar from '@/components/chat/AvengerPixelAvatar.vue'
import { AVENGERS_AVATARS } from '@/components/chat/avengerAvatars'
import TurnstileWidget from '@/components/TurnstileWidget.vue'
import {
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  countChars,
  useGuestbook,
} from '@/composables/useGuestbook'
import { useSiteConfig } from '@/composables/useSiteConfig'
import { useRetroSound } from '@/composables/useRetroSound'

const {
  entries,
  stats,
  servedFrom,
  isLoading,
  isLoadingMore,
  isSubmitting,
  isEmpty,
  hasMore,
  error,
  errorCode,
  submitError,
  submitErrorCode,
  loadMore,
  submit,
  refresh,
} = useGuestbook()

const { config } = useSiteConfig()
const { playPop, playSuccess, playError, playBlip } = useRetroSound()

const draft = ref({ name: '', message: '', avatarId: 'ironman' })
const justPosted = ref(false)
const turnstileToken = ref('')
const turnstileWidgetRef = ref<InstanceType<typeof TurnstileWidget> | null>(null)
let postedTimer: ReturnType<typeof setTimeout> | null = null

const nameLength = computed(() => countChars(draft.value.name))
const messageLength = computed(() => countChars(draft.value.message))

function onTurnstileVerify(token: string) {
  turnstileToken.value = token
}

function onTurnstileExpire() {
  turnstileToken.value = ''
}

function onTurnstileError() {
  turnstileToken.value = ''
}

const canSubmit = computed(
  () =>
    !isSubmitting.value &&
    nameLength.value > 0 &&
    nameLength.value <= MAX_NAME_LENGTH &&
    messageLength.value > 0 &&
    messageLength.value <= MAX_MESSAGE_LENGTH,
)

/**
 * The 503 that means "D1 and KV are not wired up yet" rather than "something broke".
 * Worth its own state: on a fresh clone this is the expected condition, and a red
 * error box would send the reader looking for a bug instead of at docs/DATA.md.
 */
const isUnconfigured = computed(() => errorCode.value === 'STORAGE_UNAVAILABLE')

/** Where the list came from, shown so the cache is observable instead of invisible. */
const sourceBadge = computed(() => {
  if (servedFrom.value === 'kv') return { label: 'KV cache', color: 'var(--green-main)' }
  if (servedFrom.value === 'd1') return { label: 'D1 query', color: 'var(--blue-main)' }
  return null
})

/** `createdAt` arrives as an ISO-8601 string, not epoch millis — see useGuestbook. */
function formatWhen(createdAt: string): string {
  const timestamp = new Date(createdAt).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'baru saja'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} menit lalu`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`

  const days = Math.round(hours / 24)
  if (days < 7) return `${days} hari lalu`

  return new Date(timestamp).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * "Bandung, ID" when both are known, whichever half is known otherwise, else ''.
 *
 * The worker substitutes the literal `'unknown'` for missing geo rather than null,
 * so that string is what has to be filtered out — printing it verbatim would be
 * worse than printing nothing.
 */
function formatPlace(city: string, country: string): string {
  return [city, country].filter((part) => part && part !== 'unknown').join(', ')
}

function selectAvatar(id: string) {
  draft.value.avatarId = id
  playPop()
}

async function handleSubmit() {
  if (!canSubmit.value) return

  const posted = await submit({
    name: draft.value.name,
    message: draft.value.message,
    avatarId: draft.value.avatarId,
    turnstileToken: turnstileToken.value,
  })

  // Turnstile tokens are single-use — reset after any submission attempt
  turnstileWidgetRef.value?.reset()
  turnstileToken.value = ''

  if (!posted) {
    playError()
    return
  }

  playSuccess()

  // Avatar deliberately kept, so posting twice does not mean picking a hero twice.
  draft.value.name = ''
  draft.value.message = ''

  justPosted.value = true
  if (postedTimer !== null) clearTimeout(postedTimer)
  postedTimer = setTimeout(() => {
    justPosted.value = false
    postedTimer = null
  }, 4000)
}

onMounted(refresh)

onUnmounted(() => {
  if (postedTimer !== null) clearTimeout(postedTimer)
})
</script>

<template>
  <section class="guestbook" aria-labelledby="guestbook-title">
    <header class="guestbook__header">
      <div class="guestbook__heading">
        <h2 id="guestbook-title" class="guestbook__title">📖 Edge Guestbook</h2>
        <p class="guestbook__subtitle">
          Tinggalin pesan, langsung kesimpen di D1 di edge terdekat.
        </p>
      </div>

      <div class="guestbook__meta">
        <span v-if="stats" class="guestbook__count">
          {{ stats.total }} pesan
        </span>
        <span
          v-if="sourceBadge"
          class="guestbook__badge"
          :style="{ borderColor: sourceBadge.color }"
          :title="
            servedFrom === 'kv'
              ? 'Halaman ini dilayani dari cache KV, tanpa menyentuh database'
              : 'Cache-nya masih kosong, jadi ini hasil query langsung ke D1'
          "
        >
          {{ sourceBadge.label }}
        </span>
      </div>
    </header>

    <!-- Bindings not created yet: expected on a fresh clone, so it reads as a to-do -->
    <div v-if="isUnconfigured" class="guestbook__setup">
      <p class="guestbook__setup-title">Storage belum dipasang</p>
      <p class="guestbook__setup-text">
        Buku tamu butuh binding D1 dan KV. Langkahnya ada di
        <code>docs/DATA.md</code>.
      </p>
    </div>

    <template v-else>
      <!-- Switched off from KV, no deploy needed -->
      <p v-if="!config.guestbookEnabled" class="guestbook__notice">
        {{ config.guestbookNotice ?? 'Buku tamu sedang ditutup sementara. Balik lagi nanti ya!' }}
      </p>

      <form v-else class="guestbook__form" @submit.prevent="handleSubmit">
        <fieldset class="guestbook__avatars">
          <legend class="guestbook__legend">Pilih avatar</legend>
          <button
            v-for="avatar in AVENGERS_AVATARS"
            :key="avatar.id"
            type="button"
            class="guestbook__avatar"
            :class="{ 'guestbook__avatar--active': draft.avatarId === avatar.id }"
            :aria-pressed="draft.avatarId === avatar.id"
            :title="avatar.name"
            @click="selectAvatar(avatar.id)"
          >
            <AvengerPixelAvatar :avatar-id="avatar.id" :size="28" />
          </button>
        </fieldset>

        <div class="guestbook__field">
          <label class="guestbook__label" for="guestbook-name">Nama</label>
          <input
            id="guestbook-name"
            v-model="draft.name"
            class="guestbook__input"
            type="text"
            autocomplete="nickname"
            placeholder="Siapa nih?"
            :maxlength="MAX_NAME_LENGTH * 2"
          />
          <span
            class="guestbook__counter"
            :class="{ 'guestbook__counter--over': nameLength > MAX_NAME_LENGTH }"
          >
            {{ nameLength }}/{{ MAX_NAME_LENGTH }}
          </span>
        </div>

        <div class="guestbook__field">
          <label class="guestbook__label" for="guestbook-message">Pesan</label>
          <textarea
            id="guestbook-message"
            v-model="draft.message"
            class="guestbook__textarea"
            rows="3"
            placeholder="Titip pesan, saran, atau sapaan..."
            :maxlength="MAX_MESSAGE_LENGTH * 2"
          />
          <span
            class="guestbook__counter"
            :class="{ 'guestbook__counter--over': messageLength > MAX_MESSAGE_LENGTH }"
          >
            {{ messageLength }}/{{ MAX_MESSAGE_LENGTH }}
          </span>
        </div>

        <div class="guestbook__turnstile">
          <TurnstileWidget
            ref="turnstileWidgetRef"
            action="guestbook_post"
            theme="auto"
            @verify="onTurnstileVerify"
            @expire="onTurnstileExpire"
            @error="onTurnstileError"
          />
        </div>

        <div class="guestbook__actions">
          <button class="guestbook__submit" type="submit" :disabled="!canSubmit">
            {{ isSubmitting ? 'Mengirim...' : 'Kirim pesan' }}
          </button>
          <Transition name="guestbook-fade">
            <span v-if="justPosted" class="guestbook__posted">Kesimpen! 🎉</span>
          </Transition>
        </div>

        <p
          v-if="submitError"
          class="guestbook__submit-error"
          :class="{ 'guestbook__submit-error--wait': submitErrorCode === 'RATE_LIMITED' }"
          role="alert"
        >
          {{ submitError }}
        </p>
      </form>

      <!-- List -->
      <div v-if="error && !isUnconfigured" class="guestbook__error">
        <p class="guestbook__error-text">{{ error }}</p>
        <button class="guestbook__retry" type="button" @click="() => { playBlip(); refresh(); }">Coba lagi ⟳</button>
      </div>

      <div v-else-if="isLoading && !entries.length" class="guestbook__skeleton">
        <div v-for="i in 3" :key="i" class="guestbook__skeleton-card">
          <div class="guestbook__skeleton-avatar" />
          <div class="guestbook__skeleton-lines">
            <div class="guestbook__skeleton-row" style="width: 35%" />
            <div class="guestbook__skeleton-row" style="width: 80%" />
          </div>
        </div>
      </div>

      <p v-else-if="isEmpty" class="guestbook__empty">
        Belum ada pesan. Jadi yang pertama? ✨
      </p>

      <ul v-else class="guestbook__list">
        <li v-for="entry in entries" :key="entry.id" class="guestbook__entry">
          <AvengerPixelAvatar :avatar-id="entry.avatarId" :size="32" />
          <div class="guestbook__entry-body">
            <div class="guestbook__entry-head">
              <span class="guestbook__entry-name">{{ entry.name }}</span>
              <span
                v-if="formatPlace(entry.city, entry.country)"
                class="guestbook__entry-place"
              >
                {{ formatPlace(entry.city, entry.country) }}
              </span>
              <span class="guestbook__entry-when">{{ formatWhen(entry.createdAt) }}</span>
            </div>
            <p class="guestbook__entry-message">{{ entry.message }}</p>
          </div>
        </li>
      </ul>

      <button
        v-if="hasMore"
        class="guestbook__more"
        type="button"
        :disabled="isLoadingMore"
        @click="() => { playBlip(); loadMore(); }"
      >
        {{ isLoadingMore ? 'Memuat...' : 'Muat lebih banyak' }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.guestbook {
  padding: var(--space-lg);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 2px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  font-family: 'Nunito', sans-serif;
}

.guestbook__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-bottom: var(--space-md);
  margin-bottom: var(--space-md);
  border-bottom: 2px dashed var(--divider);
}

.guestbook__title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-xs);
}

.guestbook__subtitle {
  font-size: 0.85rem;
  color: var(--text-medium);
}

.guestbook__meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.guestbook__count {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  color: var(--text-medium);
}

.guestbook__badge {
  padding: 2px 10px;
  border: 2px solid var(--border);
  border-radius: var(--radius-badge);
  background: var(--surface-sunken);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-medium);
  cursor: help;
  white-space: nowrap;
}

/* Setup hint */
.guestbook__setup {
  padding: var(--space-md);
  background: var(--yellow-light);
  border: 2px dashed var(--yellow-main);
  border-radius: var(--radius-input);
}

.guestbook__setup-title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: var(--space-xs);
}

.guestbook__setup-text {
  font-size: 0.8rem;
  color: var(--text-medium);
}

.guestbook__setup-text code {
  font-family: 'Pixelify Sans', monospace;
  color: var(--code-text);
}

.guestbook__notice {
  padding: var(--space-md);
  margin-bottom: var(--space-md);
  background: var(--yellow-light);
  border: 2px solid var(--yellow-main);
  border-radius: var(--radius-input);
  font-size: 0.85rem;
  color: var(--text-dark);
}

/* Form */
.guestbook__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.guestbook__avatars {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  border: none;
  padding: 0;
}

.guestbook__legend {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-medium);
  margin-bottom: var(--space-xs);
}

.guestbook__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: var(--surface-sunken);
  border: 2px solid transparent;
  border-radius: var(--radius-input);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.guestbook__avatar:hover {
  transform: scale(1.08);
}

.guestbook__avatar--active {
  border-color: var(--blue-main);
  background: var(--blue-light);
}

.guestbook__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.guestbook__label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-medium);
}

.guestbook__input,
.guestbook__textarea {
  width: 100%;
  padding: 8px 12px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius-input);
  font-family: 'Nunito', sans-serif;
  font-size: 0.9rem;
  color: var(--text-dark);
  resize: vertical;
}

.guestbook__input:focus,
.guestbook__textarea:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.guestbook__counter {
  align-self: flex-end;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.65rem;
  color: var(--text-medium);
}

.guestbook__counter--over {
  color: var(--status-error);
  font-weight: 700;
}

.guestbook__actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.guestbook__submit {
  padding: 8px 18px;
  background: var(--green-light);
  border: 2px solid var(--green-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
  transition: background 0.15s ease;
}

.guestbook__submit:hover:not(:disabled) {
  background: var(--green-main);
}

.guestbook__submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.guestbook__posted {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  color: var(--status-success-text);
}

.guestbook__submit-error {
  font-size: 0.8rem;
  color: var(--status-error);
}

.guestbook__submit-error--wait {
  color: var(--text-medium);
}

/* List */
.guestbook__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  list-style: none;
  padding: 0;
}

.guestbook__entry {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--surface-sunken);
  border: 2px solid var(--divider);
  border-radius: var(--radius-input);
}

.guestbook__entry-body {
  flex: 1;
  min-width: 0;
}

.guestbook__entry-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-sm);
  margin-bottom: 2px;
}

.guestbook__entry-name {
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-dark);
}

.guestbook__entry-place,
.guestbook__entry-when {
  font-size: 0.7rem;
  color: var(--text-medium);
}

.guestbook__entry-message {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-dark);
  /* Entries are visitor-supplied, so a single long token must wrap rather than
     stretch the panel. Newlines are preserved because the server keeps up to two. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.guestbook__empty {
  padding: var(--space-lg) 0;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-medium);
}

.guestbook__more {
  width: 100%;
  margin-top: var(--space-md);
  padding: 8px 12px;
  background: var(--blue-light);
  border: 2px solid var(--blue-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
}

.guestbook__more:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Error + skeleton */
.guestbook__error {
  text-align: center;
  padding: var(--space-md) 0;
}

.guestbook__error-text {
  font-size: 0.85rem;
  color: var(--status-error);
  margin-bottom: var(--space-sm);
}

.guestbook__retry {
  padding: 6px 14px;
  background: var(--pink-light);
  border: 2px solid var(--pink-main);
  border-radius: var(--radius-btn);
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-dark);
  cursor: pointer;
}

.guestbook__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.guestbook__skeleton-card {
  display: flex;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: 2px solid var(--divider);
  border-radius: var(--radius-input);
}

.guestbook__skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  flex-shrink: 0;
  background: var(--divider);
  animation: guestbook-shimmer 1.5s infinite ease-in-out;
}

.guestbook__skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}

.guestbook__skeleton-row {
  height: 12px;
  background: linear-gradient(
    90deg,
    var(--divider) 25%,
    var(--bg-soft) 50%,
    var(--divider) 75%
  );
  background-size: 200% 100%;
  border-radius: 4px;
  animation: guestbook-shimmer 1.5s infinite ease-in-out;
}

@keyframes guestbook-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.guestbook-fade-enter-active,
.guestbook-fade-leave-active {
  transition: opacity 0.25s ease;
}

.guestbook-fade-enter-from,
.guestbook-fade-leave-to {
  opacity: 0;
}

@media (min-width: 768px) {
  .guestbook__form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
  }

  .guestbook__avatars,
  .guestbook__turnstile,
  .guestbook__actions,
  .guestbook__submit-error {
    grid-column: 1 / -1;
  }
}
</style>
