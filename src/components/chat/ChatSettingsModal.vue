<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  isOpen: boolean
  currentEndpointUrl: string
  currentApiKey: string
  defaultEndpoint: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'save', payload: { endpointUrl: string; apiKey: string }): void
  (e: 'reset-default'): void
}>()

const inputEndpoint = ref(props.currentEndpointUrl)
const inputApiKey = ref(props.currentApiKey)
const saveSuccess = ref(false)

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      inputEndpoint.value = props.currentEndpointUrl
      inputApiKey.value = props.currentApiKey
      saveSuccess.value = false
    }
  }
)

function handleSave() {
  emit('save', {
    endpointUrl: inputEndpoint.value.trim(),
    apiKey: inputApiKey.value.trim(),
  })
  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
    emit('close')
  }, 600)
}

function handleReset() {
  inputEndpoint.value = props.defaultEndpoint
  inputApiKey.value = ''
  emit('reset-default')
  saveSuccess.value = true
  setTimeout(() => {
    saveSuccess.value = false
    emit('close')
  }, 600)
}
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card">
      <header class="modal-header">
        <div class="modal-header__title">
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" class="modal-icon">
            <path d="M8 0a1.5 1.5 0 0 1 1.5 1.5v.6a6.002 6.002 0 0 1 2.24 1.3l.53-.3a1.5 1.5 0 0 1 2.05.55l.75 1.3a1.5 1.5 0 0 1-.55 2.05l-.52.3a6.03 6.03 0 0 1 0 2.6l.52.3a1.5 1.5 0 0 1 .55 2.05l-.75 1.3a1.5 1.5 0 0 1-2.05.55l-.53-.3a6.002 6.002 0 0 1-2.24 1.3v.6A1.5 1.5 0 0 1 8 16a1.5 1.5 0 0 1-1.5-1.5v-.6a6.002 6.002 0 0 1-2.24-1.3l-.53.3a1.5 1.5 0 0 1-2.05-.55l-.75-1.3a1.5 1.5 0 0 1 .55-2.05l.52-.3a6.03 6.03 0 0 1 0-2.6l-.52-.3a1.5 1.5 0 0 1-.55-2.05l.75-1.3a1.5 1.5 0 0 1 2.05-.55l.53.3A6.002 6.002 0 0 1 6.5 2.1v-.6A1.5 1.5 0 0 1 8 0zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>
          </svg>
          <h3>Persona API Settings</h3>
        </div>
        <button class="close-btn" @click="emit('close')" type="button">✕</button>
      </header>

      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="endpoint-input">API Endpoint URL</label>
          <input
            id="endpoint-input"
            v-model="inputEndpoint"
            type="url"
            class="form-input"
            placeholder="https://your-api.com/chat or /api/chat"
          />
          <span class="form-hint">
            Standard relative route: <code>/api/chat</code> (Local Worker) or any HTTPS URL.
          </span>
        </div>

        <div class="form-group">
          <label class="form-label" for="apikey-input">Authorization / API Key (Optional)</label>
          <input
            id="apikey-input"
            v-model="inputApiKey"
            type="password"
            class="form-input"
            placeholder="Bearer token or API Key..."
          />
          <span class="form-hint">Sent in <code>Authorization: Bearer &lt;key&gt;</code> header if provided.</span>
        </div>

        <!-- JSON Payload Format Info Box -->
        <div class="payload-info">
          <h4 class="payload-info__title">Request JSON Payload:</h4>
          <pre class="payload-info__code"><code>{
  "messages": [
    {
      "role": "user",
      "content": "Kamu siapa sih ganteng?"
    }
  ]
}</code></pre>
          <h4 class="payload-info__title" style="margin-top: 10px;">Response JSON Format:</h4>
          <pre class="payload-info__code"><code>{
  "success": true,
  "reply": "Gue Akbar..."
}</code></pre>
        </div>
      </div>

      <footer class="modal-footer">
        <button class="btn btn--secondary" @click="handleReset" type="button">
          Reset to Default
        </button>
        <div class="modal-footer__right">
          <button class="btn btn--ghost" @click="emit('close')" type="button">
            Cancel
          </button>
          <button class="btn btn--primary" @click="handleSave" type="button">
            {{ saveSuccess ? 'Saved! ✓' : 'Save Changes' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  padding: var(--space-md);
}

.modal-card {
  width: 100%;
  max-width: 520px;
  background: #FAFAF7;
  border: var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  animation: modalScale 0.15s ease-out;
}

@keyframes modalScale {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--glass-bg);
  border-bottom: var(--glass-border);
}

.modal-header__title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-family: 'Pixelify Sans', monospace;
  font-size: 1.15rem;
  color: var(--text-dark);
}

.modal-icon {
  color: var(--lavender-main);
}

.close-btn {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  color: var(--text-medium);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-dark);
}

.modal-body {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text-dark);
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  font-family: inherit;
  font-size: 0.9rem;
  color: var(--text-dark);
  outline: none;
  transition: border-color 0.15s ease;
}

.form-input:focus {
  border-color: var(--blue-main);
  box-shadow: 0 0 0 3px rgba(169, 216, 229, 0.25);
}

.form-hint {
  font-size: 0.76rem;
  color: var(--text-medium);
}

.payload-info {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: var(--space-md);
}

.payload-info__title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-medium);
  margin-bottom: 6px;
}

.payload-info__code {
  font-family: monospace;
  font-size: 0.8rem;
  background: #ffffff;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--divider);
  color: #c7254e;
  white-space: pre-wrap;
  word-break: break-all;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md) var(--space-lg);
  background: var(--bg-soft);
  border-top: 1px solid var(--divider);
}

.modal-footer__right {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.btn {
  padding: 8px 16px;
  border-radius: var(--radius-btn);
  font-family: 'Nunito', sans-serif;
  font-weight: 700;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn--primary {
  background: var(--blue-main);
  border: none;
  color: var(--text-dark);
}

.btn--primary:hover {
  transform: translateY(-2px);
  background: #94cadc;
}

.btn--secondary {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-dark);
}

.btn--secondary:hover {
  background: #ffffff;
}

.btn--ghost {
  background: transparent;
  border: none;
  color: var(--text-medium);
}

.btn--ghost:hover {
  color: var(--text-dark);
}
</style>
