<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AvengerPixelAvatar from './AvengerPixelAvatar.vue'
import DoctorStrangePortalEffect from './DoctorStrangePortalEffect.vue'
import { AVENGERS_AVATARS, type AvengerAvatarInfo } from './avengerAvatars'
import { useRetroSound } from '../../composables/useRetroSound'

const props = defineProps<{
  initialAvatarId?: string
}>()

const emit = defineEmits<{
  (e: 'select', avatarId: string): void
  (e: 'dismiss'): void
}>()

const { playPop, playSuccess } = useRetroSound()

const selectedId = ref<string>(props.initialAvatarId || 'ironman')
const showDoctorStrangePortal = ref(false)
const portalOrigin = ref<{ x?: number; y?: number }>({})

const overlayRef = ref<HTMLElement | null>(null)
const optionRefs = ref<Record<string, HTMLElement | null>>({})

// The grid is a fixed 3x3 (nine avatars, grid-template-columns: repeat(3, 1fr)).
// Up/Down move by a whole row, so the row stride is the column count; Left/Right
// move by one across the flat list. Edges clamp rather than wrap: a 2D grid makes
// wrapping ambiguous (Up from the top row would have to guess a column), so a
// consistent clamp in all four directions is the predictable choice.
const GRID_COLUMNS = 3

function setOptionRef(id: string, el: any) {
  if (el) {
    optionRefs.value[id] = el as HTMLElement
  }
}

// Roving tabindex: exactly one radio sits in the tab order at a time — the selected
// one, or the first if the stored id matches nothing. Every other radio is
// tabindex="-1" and reachable only via the arrow keys below, so the grid is a
// single tab stop instead of nine.
const tabbableIndex = computed(() => {
  const idx = AVENGERS_AVATARS.findIndex((a) => a.id === selectedId.value)
  return idx === -1 ? 0 : idx
})

function focusOption(id: string) {
  // The option elements are already rendered whenever this runs: arrow navigation
  // happens after mount, and the initial open focus is deferred to onMounted.
  optionRefs.value[id]?.focus()
}

function handleSelect(avatar: AvengerAvatarInfo) {
  selectedId.value = avatar.id
  playPop()
  if (avatar.id === 'drstrange') {
    const drStrangeEl = optionRefs.value['drstrange']
    const overlayEl = overlayRef.value
    if (drStrangeEl && overlayEl) {
      const optionRect = drStrangeEl.getBoundingClientRect()
      const overlayRect = overlayEl.getBoundingClientRect()
      portalOrigin.value = {
        x: optionRect.left + optionRect.width / 2 - overlayRect.left,
        y: optionRect.top + optionRect.height / 2 - overlayRect.top,
      }
    } else {
      portalOrigin.value = {}
    }

    showDoctorStrangePortal.value = false
    setTimeout(() => {
      showDoctorStrangePortal.value = true
    }, 10)
  }
}

// Selection follows focus, as an ARIA radiogroup expects: moving the roving focus
// also selects. That routes through the same handleSelect a click uses, so arrowing
// onto Doctor Strange fires his portal (and computes its origin from the tile rect)
// exactly as clicking does — the easter egg keeps working under keyboard selection.
function moveSelection(index: number) {
  const avatar = AVENGERS_AVATARS[index]
  if (!avatar) return
  handleSelect(avatar)
  focusOption(avatar.id)
}

function handleGridKeydown(event: KeyboardEvent) {
  const current = AVENGERS_AVATARS.findIndex((a) => a.id === selectedId.value)
  const start = current === -1 ? 0 : current
  const last = AVENGERS_AVATARS.length - 1

  let next = start
  switch (event.key) {
    case 'ArrowRight':
      next = Math.min(start + 1, last)
      break
    case 'ArrowLeft':
      next = Math.max(start - 1, 0)
      break
    case 'ArrowDown':
      next = Math.min(start + GRID_COLUMNS, last)
      break
    case 'ArrowUp':
      next = Math.max(start - GRID_COLUMNS, 0)
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = last
      break
    default:
      return
  }

  // A key we handle must not also scroll the popup/page — preventDefault even at a
  // clamped edge, where next === start and only the scroll suppression matters.
  event.preventDefault()
  if (next !== start) moveSelection(next)
}

// Escape lives on a mount-scoped window listener (mirrors MusicPlayerDrawer): it
// exists exactly while the picker is mounted and unbinds on close. We only emit —
// the parent decides whether dismissing is allowed (closeAvatarPicker no-ops until
// an avatar is chosen, keeping the first-visit picker mandatory) and guards its own
// popup-Escape so one press never both dismisses the picker and closes the chat.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('dismiss')
}

function handleConfirm() {
  if (selectedId.value) {
    playSuccess()
    emit('select', selectedId.value)
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  // Pull focus into the picker on open so keyboard users land on the current choice
  // (or the first avatar) rather than on <body>. This only focuses, never selects,
  // so a preselected Doctor Strange does not fire the portal merely by opening.
  const focusId = AVENGERS_AVATARS[tabbableIndex.value]?.id
  if (focusId) focusOption(focusId)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div ref="overlayRef" class="avatar-picker-overlay" role="dialog" aria-label="Pilih Avatar Marvel Avengers">
    <!-- Doctor Strange Easter Egg Sling Ring Portal Animation -->
    <DoctorStrangePortalEffect
      v-if="showDoctorStrangePortal"
      :origin-x="portalOrigin.x"
      :origin-y="portalOrigin.y"
      @complete="showDoctorStrangePortal = false"
    />

    <div class="avatar-picker-card">
      <div class="avatar-picker-header">
        <h3 class="avatar-picker-title">Choose Your Avatar</h3>
        <p class="avatar-picker-subtitle">
          Pilih dulu avatar yang merepresentasikan diri lu!
        </p>
      </div>

      <!-- 3x3 Grid -->
      <div
        class="avatar-grid"
        role="radiogroup"
        aria-label="Daftar Avatar Marvel Avengers"
        @keydown="handleGridKeydown"
      >
        <button
          v-for="(avatar, index) in AVENGERS_AVATARS"
          :key="avatar.id"
          :ref="(el) => setOptionRef(avatar.id, el)"
          type="button"
          class="avatar-option"
          :class="{
            'avatar-option--selected': selectedId === avatar.id,
            'avatar-option--drstrange': avatar.id === 'drstrange',
          }"
          :tabindex="index === tabbableIndex ? 0 : -1"
          @click="handleSelect(avatar)"
          :aria-checked="selectedId === avatar.id"
          role="radio"
          :title="`${avatar.name} - ${avatar.heroName}`"
        >
          <div class="avatar-option__preview">
            <AvengerPixelAvatar :avatar-id="avatar.id" :size="38" />
          </div>
          <span class="avatar-option__name">{{ avatar.name }}</span>
        </button>
      </div>

      <!-- Confirm Action -->
      <div class="avatar-picker-footer">
        <button
          type="button"
          class="confirm-avatar-btn"
          aria-label="Mulai chat dengan avatar yang dipilih"
          @click="handleConfirm"
        >
          Mulai Chat 🚀
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.avatar-picker-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: var(--surface-overlay);
  backdrop-filter: blur(8px);
  padding: 12px 14px;
  overflow: hidden;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.97);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.avatar-picker-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;
  gap: 8px;
}

.avatar-picker-header {
  text-align: center;
}

.avatar-picker-title {
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-dark);
  margin: 0 0 2px 0;
}

.avatar-picker-subtitle {
  font-size: 0.78rem;
  color: var(--text-medium);
  margin: 0;
  line-height: 1.3;
}

/* 3x3 Grid */
.avatar-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 2px 0;
  margin: auto 0;
}

.avatar-option {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  background: var(--surface-sunken);
  border: 2px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.avatar-option:hover {
  transform: translateY(-2px);
  border-color: var(--select-border-hover);
  background: var(--surface);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}

.avatar-option:active {
  transform: scale(0.97);
}

/* A dark focus ring, independent of the blue/orange selection tint, so the roving
   focus is visible even where it lands on the already-selected tile and does not
   rely on colour alone to say "you are here". */
.avatar-option:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.avatar-option--selected {
  border-color: var(--select-ring);
  background: var(--select-bg);
  /* Ring carries the selection; the second layer is plain elevation. A tinted
     bloom here would read as glow, which design.md rules out, and a hardcoded
     accent would not follow the night palette. */
  box-shadow: 0 0 0 2.5px var(--select-ring), 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: scale(1.03);
}

.avatar-option--drstrange.avatar-option--selected {
  border-color: var(--select-ring-mystic);
  background: var(--select-bg-mystic);
  box-shadow: 0 0 0 2.5px var(--select-ring-mystic), 0 4px 12px rgba(0, 0, 0, 0.1);
}

.avatar-option--selected:hover,
.avatar-option--selected:active {
  border-color: var(--select-ring-hover);
  background: var(--select-bg-hover);
}

.avatar-option__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}

.avatar-option__name {
  font-family: 'Nunito', sans-serif;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-dark);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.avatar-option--selected .avatar-option__name {
  color: var(--select-text);
  font-weight: 800;
}

/* Footer */
.avatar-picker-footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  padding-bottom: 2px;
}

.confirm-avatar-btn {
  /* Flex-centred with an explicit floor so the control always clears the 44x44
     minimum hit area even though its padding alone would fall a few px short. */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 9px 12px;
  background: var(--blue-main);
  border: 1.5px solid var(--blue-deep);
  border-radius: 12px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-dark);
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
}

.confirm-avatar-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.confirm-avatar-btn:hover {
  transform: translateY(-1px);
  background: var(--blue-deep);
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.08);
}

.confirm-avatar-btn:active {
  transform: translateY(0);
}
</style>
