import { computed, readonly, ref } from 'vue'

/**
 * The site owner, as far as this browser knows.
 *
 * The site has no accounts. The owner proves who they are with `OWNER_KEY`, a
 * worker secret, which they hand to each of their browsers once by opening
 * `https://aryaptrha.fun/#owner=<key>`. The fragment is the delivery channel on
 * purpose: browsers never send it to a server, so the key reaches no request log,
 * and `captureOwnerKeyFromUrl` takes it out of the address bar before the app
 * mounts. `#owner=` with nothing after it forgets the key.
 *
 * Holding a key here only shows owner controls. The worker checks the key on
 * every owner request and answers 401 to a wrong one, which `forgetOwner` turns
 * back into a visitor's view.
 */

const STORAGE_KEY = 'persona_owner_key'
const HASH_PREFIX = '#owner='

function readStoredKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    // Storage can be blocked (private mode, site data disabled): no owner then.
    return ''
  }
}

/** Module-level, so every component in the tab agrees on who is looking. */
const ownerKey = ref(readStoredKey())

function setOwnerKey(key: string): void {
  ownerKey.value = key
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Kept for this tab only when storage is unavailable.
  }
}

/** Called from `main.ts` before the app mounts. */
export function captureOwnerKeyFromUrl(): void {
  if (!location.hash.startsWith(HASH_PREFIX)) return

  let key = location.hash.slice(HASH_PREFIX.length)
  try {
    key = decodeURIComponent(key)
  } catch {
    // Not percent-encoded; a base64url key never is, so use it as given.
  }
  setOwnerKey(key.trim())
  history.replaceState(history.state, '', location.pathname + location.search)
}

export function useOwner() {
  return {
    ownerKey: readonly(ownerKey),
    isOwner: computed(() => ownerKey.value.length > 0),
    forgetOwner: () => setOwnerKey(''),
  }
}
