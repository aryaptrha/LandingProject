import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import { captureOwnerKeyFromUrl } from './composables/useOwner'

// Before mounting, so an `#owner=` key is out of the address bar before anything
// renders, is bookmarked, or is shared.
captureOwnerKeyFromUrl()

createApp(App).mount('#app')
