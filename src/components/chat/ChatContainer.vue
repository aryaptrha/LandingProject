<script setup lang="ts">
import { ref } from 'vue'
import { useChat } from '../../composables/useChat'
import ChatHeader from './ChatHeader.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'
import ChatSettingsModal from './ChatSettingsModal.vue'

const {
  endpointUrl,
  apiKey,
  messages,
  isLoading,
  sendMessage,
  clearMessages,
  setEndpoint,
  setApiKey,
  DEFAULT_ENDPOINT,
} = useChat()

const isSettingsOpen = ref(false)

function handleSelectStarter(text: string) {
  sendMessage(text)
}

function handleSaveSettings(payload: { endpointUrl: string; apiKey: string }) {
  setEndpoint(payload.endpointUrl)
  setApiKey(payload.apiKey)
}

function handleResetSettings() {
  setEndpoint(DEFAULT_ENDPOINT)
  setApiKey('')
}
</script>

<template>
  <section class="chat-container">
    <!-- Chat Header -->
    <ChatHeader
      :endpoint-url="endpointUrl"
      :is-custom-endpoint="endpointUrl !== DEFAULT_ENDPOINT"
      @open-settings="isSettingsOpen = true"
      @clear-chat="clearMessages"
    />

    <!-- Message List -->
    <ChatMessageList
      :messages="messages"
      :is-loading="isLoading"
      @select-starter="handleSelectStarter"
    />

    <!-- Chat Input Bar -->
    <ChatInput
      :is-loading="isLoading"
      @send="sendMessage"
    />

    <!-- Settings Modal -->
    <ChatSettingsModal
      :is-open="isSettingsOpen"
      :current-endpoint-url="endpointUrl"
      :current-api-key="apiKey"
      :default-endpoint="DEFAULT_ENDPOINT"
      @close="isSettingsOpen = false"
      @save="handleSaveSettings"
      @reset-default="handleResetSettings"
    />
  </section>
</template>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--glass-shadow);
  overflow: hidden;
}
</style>
