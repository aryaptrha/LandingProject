/**
 * Board geometry, limits and wire protocol for the shared pixel canvas.
 *
 * Split out from the Durable Object itself so the route can validate a request
 * without importing the DO class, and so the numbers that both sides have to agree
 * on live in exactly one place.
 *
 * **The palette lives on the client, not here, and that is deliberate.** A cell
 * stores a palette *index*, never a colour. The index is resolved to a real colour
 * at render time by reading the site's own CSS custom properties, which means the
 * artwork re-colours itself with the theme instead of being frozen to whichever
 * theme its author happened to be using. It also means the worker never has an
 * opinion about `#A9D6E5`: all it enforces is `0 <= color < PALETTE_SIZE`.
 * `src/utils/pixelBoard.ts` owns the token table.
 */

/** Cells per row. */
export const BOARD_WIDTH = 64

/** Cells per column. */
export const BOARD_HEIGHT = 64

/**
 * Total cells, and therefore the byte length of a packed board.
 *
 * One byte per cell keeps a whole board at 4 KiB, ~5.5 KB as base64 — small enough
 * that a joining client gets the entire artwork in a single message and needs no
 * incremental-catch-up protocol.
 */
export const BOARD_CELLS = BOARD_WIDTH * BOARD_HEIGHT

/**
 * Number of palette slots, including index 0.
 *
 * Index 0 is "empty" and is what an eraser writes; 1..PALETTE_SIZE-1 are paintable.
 * Kept under 256 so a cell is always one byte. Must match `PALETTE` in
 * `src/utils/pixelBoard.ts` — the two are in separate TypeScript projects (the app
 * config excludes `src/worker/**`), so this is agreement by convention rather than
 * by import. The route rejects out-of-range indices, so a mismatch degrades to a
 * rejected paint rather than a corrupt board.
 */
export const PALETTE_SIZE = 13

/** The empty cell. Painting this is how a visitor erases. */
export const EMPTY_CELL = 0

// --- Rate limiting ----------------------------------------------------------
//
// Four layers, innermost first. Each exists because the one inside it cannot see
// what the one outside it is protecting against.

/**
 * Minimum gap between two placements on one connection, in milliseconds.
 *
 * Held in the socket's hibernation attachment rather than in memory, so it survives
 * the object being evicted mid-session — otherwise a visitor could reset their own
 * cooldown just by being idle long enough for eviction.
 */
export const PLACE_COOLDOWN_MS = 1500

/**
 * Placements allowed per verified session per UTC day.
 *
 * Exact, not approximate. A Durable Object is single-threaded, which gives the
 * read-modify-write atomicity that `services/ratelimit.service.ts` documents KV as
 * unable to provide — so this counter cannot be beaten by concurrent requests.
 *
 * Keyed on the `ap_sid` cookie the document response already sets, and only on a
 * Turnstile-minted token where the visitor happens to have one from the chat.
 *
 * The cookie is discardable, so this is a fairness measure and not a hard cap: a
 * determined client can clear it and earn another 150. That is accepted deliberately.
 * The alternative is a Turnstile challenge before the first pixel, which would gate a
 * one-click delight feature behind a captcha to protect a resource whose real limit is
 * `GLOBAL_DAILY_BUDGET` below — and that budget is unaffected by cookie resets, so the
 * free tier stays protected either way. A pixel is one byte from a fixed palette: there
 * is no content to moderate and no upstream call to pay for, which is what separates
 * this from the guestbook and the chat, where Turnstile does still guard the door.
 */
export const SESSION_DAILY_QUOTA = 150

/**
 * Global placements per UTC day before the board goes read-only.
 *
 * 60 % of a Durable Object's 100k requests/day free-tier bucket, which is separate
 * from the Worker's own 100k. The 40 % headroom covers the upgrade request each
 * viewer costs and leaves the rest of the site unaffected if the board is busy.
 *
 * Reaching it is not an error: the board keeps serving and keeps streaming other
 * people's pixels, it just stops accepting new ones and says so.
 */
export const GLOBAL_DAILY_BUDGET = 60000

/**
 * Cap on inbound message size, in bytes.
 *
 * A `place` message is well under 200 bytes; a session token pushes the first one to
 * a few hundred. 4 KiB is generous and still bounds what an abusive client can make
 * the object parse.
 */
export const MAX_MESSAGE_BYTES = 4096

// --- Wire protocol ----------------------------------------------------------

/** Why a placement was refused. Distinct codes so the UI can say something true. */
export type RejectCode =
  | 'COOLDOWN'
  | 'QUOTA_EXHAUSTED'
  | 'BUDGET_EXHAUSTED'
  | 'BAD_REQUEST'
  | 'CANVAS_DISABLED'

/** Client → server: place one pixel. */
export interface PlaceMessage {
  op: 'place'
  /** Flat cell index, `y * BOARD_WIDTH + x`. */
  idx: number
  /** Palette index. */
  color: number
  /**
   * Signed session token from `POST /api/session`, when the visitor already has one.
   *
   * Purely an upgrade, never a requirement: it makes the quota bucket durable across
   * cookie resets for anyone who has used the chat. Without it the edge falls back to
   * the `ap_sid` cookie, so painting works for a first-time visitor who has verified
   * nothing.
   *
   * Sent in the message body rather than as a subprotocol or query parameter. A query
   * parameter would be written into the gateway's per-request log line; a subprotocol
   * would have to be chosen at connect time, before it is known whether the visitor
   * will paint at all.
   *
   * Only read on the first placement of a connection — the resolved `sid` is then held
   * in the socket's attachment and later messages may omit it.
   */
  token?: string
}

/** Client → server. Only one operation exists; presence and snapshots are pushed. */
export type ClientMessage = PlaceMessage

/** Server → client: the whole board, sent once on connect. */
export interface SnapshotMessage {
  op: 'snapshot'
  /** `BOARD_CELLS` bytes of palette indices, base64. */
  board: string
  /** Connections currently attached to the object. */
  presence: number
  /** True when the daily budget is spent; the board is view-only until 00:00 UTC. */
  readOnly: boolean
  /** Server clock, so a client can show a countdown without trusting its own. */
  now: number
}

/** Server → client: one cell changed. */
export interface PixelMessage {
  op: 'pixel'
  idx: number
  color: number
}

/** Server → client: the connection count changed. Sent on connect and close only. */
export interface PresenceMessage {
  op: 'presence'
  count: number
}

/** Server → client: a placement was refused, so roll back the optimistic pixel. */
export interface RejectMessage {
  op: 'reject'
  code: RejectCode
  /** Human-readable, safe to display. */
  message: string
  /** The cell to roll back. */
  idx: number
  /** What the cell was before the optimistic paint, so the client can restore it. */
  previous: number
  /** Milliseconds until the next placement is allowed, when the cause was a cooldown. */
  retryAfterMs?: number
}

/** Server → client: a placement was accepted, carrying the visitor's remaining quota. */
export interface AcceptMessage {
  op: 'accept'
  idx: number
  color: number
  /** Placements left today for this session. */
  remaining: number
}

/** Server → client: the board flipped between writable and read-only. */
export interface BudgetMessage {
  op: 'budget'
  readOnly: boolean
}

export type ServerMessage =
  | SnapshotMessage
  | PixelMessage
  | PresenceMessage
  | RejectMessage
  | AcceptMessage
  | BudgetMessage

/**
 * Per-connection state, persisted across hibernation via `serializeAttachment`.
 *
 * Small on purpose — the attachment is serialised on every write and there is a size
 * limit on it. Enough to enforce the cooldown and remember an already-verified
 * session, and nothing else.
 */
export interface SocketAttachment {
  /**
   * The quota bucket this connection paints from: `sid:<ap_sid>` for a visitor with the
   * document's cookie, the token's signed `sid` for one carrying a chat token, or
   * `anon:<uuid>` for a client with neither. Null only until the first placement
   * resolves it, and on a connection whose upgrade carried no cookie.
   */
  sid: string | null
  /** `Date.now()` of the last accepted placement, for the cooldown. */
  lastPlacedAt: number
}

/** Whether a value is a usable flat cell index. */
export function isValidIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < BOARD_CELLS
}

/** Whether a value is a usable palette index. */
export function isValidColor(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < PALETTE_SIZE
}

/**
 * The UTC day key used by both the per-session quota and the global budget.
 *
 * UTC rather than local time so the reset is a single global instant. Everyone's
 * quota returns at the same moment and the notice can say "00:00 UTC" without
 * qualification.
 */
export function utcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}
