import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'
import { apiGet } from '../utils/api'
import {
  BOARD_CELLS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  EMPTY_CELL,
  PALETTE_SIZE,
  unpackBoard,
} from '../utils/pixelBoard'

/**
 * Live state for the shared pixel canvas.
 *
 * Owns the socket, the board bytes, presence, the read-only flag, and the optimistic
 * paint that makes a click feel instant. The panel component renders; this decides.
 *
 * Unlike the polling composables (`useEdgeStatus`, `useLatency`) there is no interval:
 * the edge pushes. The only timer here is the reconnect backoff.
 *
 * ## Board bytes are a `shallowRef`, deliberately
 *
 * A `ref(new Uint8Array(4096))` would make Vue deep-track 4096 numeric indices and
 * re-run every dependent effect on each pixel. The board is drawn to a canvas by
 * imperative code that does not need per-cell reactivity — it needs to be told
 * "something changed, redraw". So mutations bump `boardVersion` and the component
 * watches that one number.
 */

/** What the panel needs to know about the connection, in one word. */
export type CanvasStatus = 'connecting' | 'live' | 'readonly' | 'offline' | 'disabled'

/** Snapshot shape from `GET /api/canvas`, which also carries the server's limits. */
interface CanvasHttpSnapshot {
  board: string
  presence: number
  readOnly: boolean
  now: number
  width: number
  height: number
  paletteSize: number
  cooldownMs: number
  dailyQuota: number
}

/**
 * How long to wait before reconnect attempt `n`, in ms.
 *
 * Exponential to a 30 s ceiling, then **jittered by up to ±25 %**. The jitter is not
 * decoration: without it every visitor whose socket dropped together — a worker
 * redeploy, a colo blip — comes back in the same millisecond, and the reconnect storm
 * is worse than the outage. Spreading the retries is what makes the herd survivable.
 */
function backoffDelay(attempt: number): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
  return Math.round(base * (0.75 + Math.random() * 0.5))
}

export function usePixelCanvas() {
  // Annotated `Uint8Array` rather than inferred, so the element type stays
  // buffer-agnostic. Inference from a constructor call narrows to
  // `Uint8Array<ArrayBuffer>`, and `unpackBoard`'s return is the wider
  // `Uint8Array<ArrayBufferLike>` — which would make replacing the board a type error
  // over a distinction (could this be backed by a SharedArrayBuffer?) that means nothing
  // to anything reading these bytes.
  const board = shallowRef<Uint8Array>(new Uint8Array(BOARD_CELLS))
  /** Incremented on every board mutation, so the renderer has one thing to watch. */
  const boardVersion = ref(0)

  const status = ref<CanvasStatus>('connecting')
  const presence = ref(0)
  const readOnly = ref(false)
  const notice = ref<string | null>(null)
  /** Placements left today, from the last `accept`. Null until the first one lands. */
  const remaining = ref<number | null>(null)
  /** Last rejection worth showing, already phrased for a human by the worker. */
  const lastReject = ref<string | null>(null)

  /** Authoritative board geometry, replaced by the first snapshot that arrives. */
  const width = ref(BOARD_WIDTH)
  const height = ref(BOARD_HEIGHT)
  const cooldownMs = ref(1500)
  const dailyQuota = ref<number | null>(null)

  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let disposed = false
  /**
   * The chat's session token, when this visitor has one. Read once, lazily.
   *
   * `undefined` means "not looked for yet"; `null` means "looked, none there", which is
   * the common case and is fine — see `readSessionToken`.
   */
  let sessionToken: string | null | undefined

  /**
   * Cells this client painted but the edge has not confirmed, mapped to the colour
   * that was there before.
   *
   * This is the rollback ledger. An optimistic paint that gets rejected — cooldown,
   * quota, a read-only board — has to put the previous colour back, or the visitor is
   * left looking at a pixel that does not exist on anyone else's screen. Keyed by index
   * because the worker's `reject` carries the index it refused.
   */
  const pending = new Map<number, number>()

  function touch(): void {
    boardVersion.value += 1
  }

  function paintLocal(idx: number, color: number): void {
    if (idx < 0 || idx >= board.value.length) return
    board.value[idx] = color
    touch()
  }

  // --- Snapshot ---------------------------------------------------------------

  function applySnapshot(packed: string, cells: number): boolean {
    const next = unpackBoard(packed, cells)
    if (!next) return false
    board.value = next
    // A fresh snapshot supersedes every optimistic guess, confirmed or not.
    pending.clear()
    touch()
    return true
  }

  /**
   * Loads the board over plain HTTP.
   *
   * Runs before the socket opens, and is the reason the panel is never blank: a
   * WebSocket is blocked by some corporate proxies and a few privacy extensions, and
   * the artwork is the point of the feature. Where the socket cannot open, this alone
   * still renders the board — read-only, honestly labelled.
   */
  async function loadSnapshot(): Promise<void> {
    try {
      const data = await apiGet<CanvasHttpSnapshot>('/api/canvas')

      // The server's geometry wins. The bundle's constants are what the client
      // *assumed*; these are what the bytes on the wire actually mean, and trusting the
      // stale half of a skewed deploy is how a board renders sheared.
      if (Number.isInteger(data.width) && data.width > 0) width.value = data.width
      if (Number.isInteger(data.height) && data.height > 0) height.value = data.height
      if (Number.isInteger(data.cooldownMs) && data.cooldownMs >= 0) {
        cooldownMs.value = data.cooldownMs
      }
      if (Number.isInteger(data.dailyQuota) && data.dailyQuota > 0) {
        dailyQuota.value = data.dailyQuota
      }

      if (data.paletteSize !== PALETTE_SIZE) {
        // Not fatal — the worker still rejects out-of-range colours, so the board stays
        // valid. But the swatch row and the server disagree about what is paintable,
        // which is worth one line in a console rather than a silent mystery later.
        console.warn(
          `Pixel canvas palette mismatch: worker has ${data.paletteSize}, bundle has ${PALETTE_SIZE}`,
        )
      }

      readOnly.value = data.readOnly === true
      presence.value = Number.isInteger(data.presence) ? data.presence : 0
      applySnapshot(data.board, width.value * height.value)
    } catch {
      // Leave the board empty and let the socket try. If that fails too, `status`
      // becomes 'offline' and the panel says so.
    }
  }

  // --- Socket -----------------------------------------------------------------

  function socketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/api/canvas/socket`
  }

  function scheduleReconnect(): void {
    if (disposed || reconnectTimer) return
    const delay = backoffDelay(attempt)
    attempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function connect(): void {
    if (disposed || socket) return

    let ws: WebSocket
    try {
      ws = new WebSocket(socketUrl())
    } catch {
      status.value = 'offline'
      scheduleReconnect()
      return
    }
    socket = ws

    ws.addEventListener('open', () => {
      // Not 'live' yet — the snapshot decides that. An open socket that has not yet
      // said whether the board is read-only cannot honestly be called live.
      attempt = 0
    })

    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(event.data) as Record<string, unknown>
      } catch {
        return
      }
      handleMessage(msg)
    })

    ws.addEventListener('close', () => {
      socket = null
      if (disposed) return
      status.value = 'offline'
      scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      // `close` always follows, and that is where the reconnect is scheduled. Doing it
      // here as well would queue two.
    })
  }

  function handleMessage(msg: Record<string, unknown>): void {
    switch (msg.op) {
      case 'snapshot': {
        // A full re-read on every (re)connect rather than trusting what is on screen.
        // While the socket was down other people kept painting, and there is no way to
        // know what was missed — so the local board is not a base to patch, it is
        // stale.
        if (typeof msg.board === 'string') {
          applySnapshot(msg.board, width.value * height.value)
        }
        if (typeof msg.presence === 'number') presence.value = msg.presence
        readOnly.value = msg.readOnly === true
        status.value = readOnly.value ? 'readonly' : 'live'
        break
      }

      case 'pixel': {
        const idx = msg.idx
        const color = msg.color
        if (typeof idx === 'number' && typeof color === 'number') paintLocal(idx, color)
        break
      }

      case 'presence': {
        if (typeof msg.count === 'number') presence.value = msg.count
        break
      }

      case 'accept': {
        const idx = msg.idx
        if (typeof idx === 'number') pending.delete(idx)
        if (typeof msg.remaining === 'number') remaining.value = msg.remaining
        lastReject.value = null
        break
      }

      case 'reject': {
        const idx = msg.idx
        // Roll back to what the ledger says was there, not to what the message reports:
        // `previous` is the worker's view, and if the two disagree the ledger is the one
        // that matches what this visitor actually saw before clicking.
        if (typeof idx === 'number' && pending.has(idx)) {
          paintLocal(idx, pending.get(idx) ?? EMPTY_CELL)
          pending.delete(idx)
        } else if (typeof idx === 'number' && typeof msg.previous === 'number') {
          paintLocal(idx, msg.previous)
        }

        if (msg.code === 'BUDGET_EXHAUSTED') {
          readOnly.value = true
          status.value = 'readonly'
        }
        lastReject.value = typeof msg.message === 'string' ? msg.message : null
        break
      }

      case 'budget': {
        readOnly.value = msg.readOnly === true
        status.value = readOnly.value ? 'readonly' : 'live'
        break
      }
    }
  }

  // --- Painting ---------------------------------------------------------------

  /**
   * Reads the session token the chat mints, if this visitor happens to have used it.
   *
   * Deliberately does *not* mint one. Minting means solving Turnstile, and the edge does
   * not require a token to paint — it falls back to the `ap_sid` cookie every document
   * response already sets, so a first-time visitor can paint immediately. All a token buys
   * is a quota bucket that survives clearing cookies.
   *
   * An earlier version posted Cloudflare's dummy test token to `/api/session` here. That
   * only ever works against a *test* secret key: in production, where the key is real, the
   * mint failed, no token existed, and the edge refused every pixel with "verify first"
   * — an instruction the panel gave no way to follow. Reading a token that may not be
   * there, and not caring when it is not, is the honest version of that idea.
   *
   * The key is duplicated from `useChat.ts` rather than imported, to keep the chat's module
   * graph out of this async chunk. If it ever drifts, the cost is a per-connection quota
   * bucket instead of a per-session one — a degradation, not a break.
   */
  function readSessionToken(): string | null {
    if (sessionToken !== undefined) return sessionToken
    try {
      sessionToken = sessionStorage.getItem('chat_session_token') || null
    } catch {
      // Storage can throw outright in a locked-down browser, not merely return null.
      sessionToken = null
    }
    return sessionToken
  }

  /**
   * Paints a cell locally and asks the edge to confirm it.
   *
   * Optimistic on purpose: a 1500 ms cooldown already limits how fast anyone can paint,
   * and waiting for a round trip on top of that would make a drawing tool feel broken.
   * The cost is that a rejection has to undo something the visitor already saw, which is
   * what `pending` exists for.
   */
  function place(idx: number, color: number): void {
    if (readOnly.value) return
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    if (!Number.isInteger(idx) || idx < 0 || idx >= board.value.length) return
    if (!Number.isInteger(color) || color <= EMPTY_CELL || color >= PALETTE_SIZE) return

    // Synchronous, so there is no window between the guards above and the send in which
    // the socket could close or the board could flip read-only.
    const token = readSessionToken()

    // Recorded before the local paint, so the ledger holds the colour that was actually
    // on screen. Only the first pending write per cell is kept — a second click on the
    // same cell must still roll back to the last *confirmed* colour, not to the
    // optimistic one in between.
    if (!pending.has(idx)) pending.set(idx, board.value[idx] ?? EMPTY_CELL)
    paintLocal(idx, color)

    try {
      socket.send(JSON.stringify({ op: 'place', idx, color, token: token ?? undefined }))
    } catch {
      paintLocal(idx, pending.get(idx) ?? EMPTY_CELL)
      pending.delete(idx)
    }
  }

  // --- Lifecycle --------------------------------------------------------------

  onMounted(() => {
    // Snapshot first, socket second, and not awaited: the board should appear as soon
    // as the HTTP read lands, without waiting on a handshake that may never complete.
    void loadSnapshot()
    connect()
  })

  onBeforeUnmount(() => {
    disposed = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    // 1000 (normal closure) so the object's `webSocketClose` treats this as a departure
    // and broadcasts the corrected presence count immediately.
    socket?.close(1000, 'unmounted')
    socket = null
  })

  return {
    board,
    boardVersion,
    status,
    presence,
    readOnly,
    notice,
    remaining,
    lastReject,
    width,
    height,
    cooldownMs,
    dailyQuota,
    place,
  }
}
