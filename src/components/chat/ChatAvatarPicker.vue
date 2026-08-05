<script setup lang="ts">
import { ref } from 'vue'
import AvengerPixelAvatar from './AvengerPixelAvatar.vue'
import DoctorStrangePortalEffect from './DoctorStrangePortalEffect.vue'
import { AVENGERS_AVATARS, type AvengerAvatarInfo } from './avengerAvatars'

const props = defineProps<{
  initialAvatarId?: string
}>()

const emit = defineEmits<{
  (e: 'select', avatarId: string): void
}>()

const selectedId = ref<string>(props.initialAvatarId || 'ironman')
const showDoctorStrangePortal = ref(false)
const portalOrigin = ref<{ x?: number; y?: number }>({})

const overlayRef = ref<HTMLElement | null>(null)
const optionRefs = ref<Record<string, HTMLElement | null>>({})

function setOptionRef(id: string, el: any) {
  if (el) {
    optionRefs.value[id] = el as HTMLElement
  }
}

function handleSelect(avatar: AvengerAvatarInfo) {
  selectedId.value = avatar.id
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

function handleConfirm() {
  if (selectedId.value) {
    emit('select', selectedId.value)
  }
}
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
      <div class="avatar-grid" role="radiogroup" aria-label="Daftar Avatar Marvel Avengers">
        <button
          v-for="avatar in AVENGERS_AVATARS"
          :key="avatar.id"
          :ref="(el) => setOptionRef(avatar.id, el)"
          type="button"
          class="avatar-option"
          :class="{
            'avatar-option--selected': selectedId === avatar.id,
            'avatar-option--drstrange': avatar.id === 'drstrange',
          }"
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
  background: rgba(255, 255, 255, 0.96);
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
  color: var(--text-dark, #2F2F2F);
  margin: 0 0 2px 0;
}

.avatar-picker-subtitle {
  font-size: 0.78rem;
  color: var(--text-medium, #666666);
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
  background: var(--bg-soft, #FAFAF7);
  border: 2px solid var(--border, #D8D8D8);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.avatar-option:hover {
  transform: translateY(-2px);
  border-color: #60A5FA;
  background: #ffffff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.06);
}

.avatar-option:active {
  transform: scale(0.97);
}

.avatar-option--selected {
  border-color: #2563EB;
  background: #DBEAFE;
  box-shadow: 0 0 0 2.5px #2563EB, 0 4px 14px rgba(37, 99, 235, 0.3);
  transform: scale(1.03);
}

.avatar-option--drstrange.avatar-option--selected {
  border-color: #FF8C00;
  background: #FFF3E0;
  box-shadow: 0 0 0 2.5px #FF8C00, 0 4px 16px rgba(255, 140, 0, 0.45);
}

.avatar-option--selected:hover,
.avatar-option--selected:active {
  border-color: #1D4ED8;
  background: #BFDBFE;
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
  color: var(--text-dark, #2F2F2F);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.avatar-option--selected .avatar-option__name {
  color: #1E3A8A;
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
  width: 100%;
  padding: 9px 12px;
  background: var(--blue-main, #A9D6E5);
  border: 1.5px solid #7bc3d7;
  border-radius: 12px;
  font-family: 'Pixelify Sans', monospace;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-dark, #2F2F2F);
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
}

.confirm-avatar-btn:hover {
  transform: translateY(-1px);
  background: #90cce0;
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.08);
}

.confirm-avatar-btn:active {
  transform: translateY(0);
}
</style>
