import {
  BOARD_CELLS,
  EMPTY_CELL,
  GLOBAL_DAILY_BUDGET,
  MAX_MESSAGE_BYTES,
  PLACE_COOLDOWN_MS,
  SESSION_DAILY_QUOTA,
  isValidColor,
  isValidIndex,
  utcDayKey,
  type ClientMessage,
  type RejectCode,
  type ServerMessage,
  type SocketAttachment,
} from '../types/canvas'
import type { Env } from '../types/env'
import { verifySessionToken } from '../services/token.service'

/**
 * The shared pixel board, as a single Durable Object.
 *
 * One global instance (`idFromName('board-v1')`), which is the whole point: a
 * Durable Object is a single-threaded actor with its own storage, so "read the
 * counter, check it, increment it" is atomic without a transaction. That is the
 * property `services/ratelimit.service.ts:25-27` and `gateway/breaker.ts:29-31` both
 * document KV as unable to provide, and it is what makes the per-session quota here
 * exact rather than approximate.
 *
 * ## Why this is nearly free on the Workers free plan
 *
 * Durable Objects get their own 100k requests/day bucket, separate from the Worker's.
 * Against that:
 *
 * - the WebSocket upgrade costs 1 request per viewer;
 * - each inbound `place` message costs 1;
 * - outbound broadcasts cost 0, however many sockets receive them;
 * - heartbeats cost 0, because `setWebSocketAutoResponse` answers them at the edge
 *   without ever waking this object;
 * - idle connections cost no duration at all, because they are *hibernated* — the
 *   object is evicted from memory while its sockets stay open.
 *
 * So a passive viewer costs 1 request for their whole visit and a visitor who places
 * ten pixels costs 11. The `GLOBAL_DAILY_BUDGET` stop is set at 60 % of the bucket.
 *
 * ## What hibernation demands in return
 *
 * The object can be evicted between any two messages, so **in-memory state is a
 * cache, never the source of truth**. Two consequences shape the code below:
 *
 * 1. The board is rebuilt from SQLite in the constructor, inside
 *    `blockConcurrencyWhile`, so no message can observe a half-built board.
 * 2. Per-connection state (the verified session, the cooldown timestamp) lives in the
 *    socket's *attachment*, not in a `Map` keyed by socket. A `Map` would be silently
 *    emptied by eviction, which would hand every visitor a fresh cooldown — the
 *    failure mode being invisible rather than loud is exactly why it is worth avoiding.
 */
export class PixelCanvas implements DurableObject {
  private readonly ctx: DurableObjectState
  private readonly env: Env

  /**
   * The board, mirrored in memory so a joining client is served without a query.
   *
   * Rebuilt from SQLite on construction. Every accepted placement writes both here
   * and to storage, in that order, and the write to storage is synchronous — the DO
   * SQL API is not a promise — so the two cannot drift apart across an await.
   */
  private board = new Uint8Array(BOARD_CELLS)

  /**
   * Cached global budget for `budgetDay`.
   *
   * Held in memory only to notice a UTC day rollover cheaply; the authoritative
   * number is always the row in `budget`, re-read on every placement.
   */
  private budgetDay = ''
  /**
   * Guards the unconfigured-secret warning so it is logged once per object lifetime
   * rather than once per placement. A warning on every click is a warning nobody reads,
   * and on a hibernating object "once per lifetime" is already generous.
   */
  private warnedMissingSecret = false

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env

    // Everything a message handler assumes is true must be true before any message
    // runs. `blockConcurrencyWhile` is what guarantees that: requests arriving during
    // it are queued rather than racing a half-initialised object.
    this.ctx.blockConcurrencyWhile(async () => {
      this.initSchema()
      this.hydrateBoard()
      this.pruneStaleCounters()

      // Answer client heartbeats at the edge. This is not a micro-optimisation: a
      // keepalive that reached this object would wake it out of hibernation on a
      // timer, turning every idle viewer into a steady drip of billed requests and
      // compute duration. Handled here, an idle board genuinely costs nothing.
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    })
  }

  // --- Storage ---------------------------------------------------------------

  private initSchema(): void {
    const sql = this.ctx.storage.sql

    // `color` is stored even when it is EMPTY_CELL rather than deleting the row, so an
    // erase keeps its `placed_at` and the table stays a complete history of touched
    // cells. Bounded at BOARD_CELLS rows by the primary key, so it cannot grow.
    sql.exec(`
      CREATE TABLE IF NOT EXISTS board (
        idx       INTEGER PRIMARY KEY,
        color     INTEGER NOT NULL,
        sid       TEXT,
        placed_at INTEGER NOT NULL
      )
    `)

    // Per-session daily counters. Composite key so one row exists per session per
    // day, and old days are pruned rather than accumulating forever.
    sql.exec(`
      CREATE TABLE IF NOT EXISTS quota (
        sid  TEXT    NOT NULL,
        day  TEXT    NOT NULL,
        used INTEGER NOT NULL,
        PRIMARY KEY (sid, day)
      )
    `)

    // One row per day, holding the global write count behind GLOBAL_DAILY_BUDGET.
    sql.exec(`
      CREATE TABLE IF NOT EXISTS budget (
        day    TEXT PRIMARY KEY,
        writes INTEGER NOT NULL
      )
    `)
  }

  /** Rebuilds the in-memory board from storage. Called once, before any message. */
  private hydrateBoard(): void {
    this.board = new Uint8Array(BOARD_CELLS)

    const rows = this.ctx.storage.sql
      .exec<{ idx: number; color: number }>('SELECT idx, color FROM board')
      .toArray()

    for (const row of rows) {
      // Defensive despite the CHECK-free schema: a board written by an older
      // PALETTE_SIZE, or a row from a future migration, must not poison the array.
      // Out-of-range values are dropped to empty rather than clamped, because a
      // wrong colour is a visible lie about what someone drew.
      if (isValidIndex(row.idx) && isValidColor(row.color)) {
        this.board[row.idx] = row.color
      }
    }
  }

  /**
   * Deletes quota and budget rows for days that have passed.
   *
   * Without this, `quota` grows by one row per painting visitor per day forever.
   * Called on construction and whenever a placement notices the UTC day has rolled
   * over, which is the only moment the set of stale rows changes.
   */
  private pruneStaleCounters(): void {
    const today = utcDayKey(Date.now())
    const sql = this.ctx.storage.sql
    sql.exec('DELETE FROM quota WHERE day < ?', today)
    sql.exec('DELETE FROM budget WHERE day < ?', today)
    this.budgetDay = today
  }

  // --- HTTP ------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.endsWith('/socket')) {
      return this.handleUpgrade(request)
    }

    if (url.pathname.endsWith('/snapshot')) {
      return Response.json({
        board: this.packBoard(),
        presence: this.ctx.getWebSockets().length,
        readOnly: this.isReadOnly(Date.now()),
        now: Date.now(),
      })
    }

    return new Response('Not found', { status: 404 })
  }

  private handleUpgrade(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    // `acceptWebSocket`, not `server.accept()`. The latter keeps this object pinned in
    // memory for the life of the connection; this one hands the socket to the runtime
    // so the object can be evicted while the connection stays open, and woken only
    // when a message actually arrives.
    this.ctx.acceptWebSocket(server)

    // A connection starts anonymous. Viewing needs no credential — only painting
    // does, and the token for that arrives with the first `place` message.
    const attachment: SocketAttachment = { sid: null, lastPlacedAt: 0 }
    server.serializeAttachment(attachment)

    const now = Date.now()

    // Sent before returning, so the board is already in flight when the client's
    // `onopen` fires and there is no window where the panel is mounted but blank.
    this.send(server, {
      op: 'snapshot',
      board: this.packBoard(),
      presence: this.ctx.getWebSockets().length,
      readOnly: this.isReadOnly(now),
      now,
    })

    // Tell everyone else the count changed. On connect and close only — a presence
    // timer would wake the object forever and is the one thing that would make an
    // idle board cost money.
    this.broadcastPresence(server, 'joining')

    return new Response(null, { status: 101, webSocket: client })
  }

  // --- WebSocket -------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      // The protocol is JSON text. Binary frames are not an error worth a reply,
      // just something this object does not speak.
      return
    }

    if (message.length > MAX_MESSAGE_BYTES) {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }

    if (typeof parsed !== 'object' || parsed === null) return

    const msg = parsed as Partial<ClientMessage>
    if (msg.op !== 'place') return

    await this.handlePlace(ws, msg)
  }

  /**
   * Validates and applies one placement.
   *
   * The order of the four checks matters. Cheap and local first, so an abusive client
   * is refused before costing a signature verification or a query; the global budget
   * last, so a visitor who is over their own quota is told *that* rather than being
   * told the site is out of budget.
   */
  private async handlePlace(ws: WebSocket, msg: Partial<ClientMessage>): Promise<void> {
    const idx = msg.idx
    const color = msg.color

    if (!isValidIndex(idx) || !isValidColor(color)) {
      // No `previous` to report, because we cannot trust the index enough to read it.
      this.send(ws, {
        op: 'reject',
        code: 'BAD_REQUEST',
        message: 'Koordinat atau warna tidak valid.',
        idx: isValidIndex(idx) ? idx : 0,
        previous: EMPTY_CELL,
      })
      return
    }

    const attachment = this.readAttachment(ws)
    const now = Date.now()
    const previous = this.board[idx] ?? EMPTY_CELL

    // 1. Authentication, resolved once per connection and then cached in the
    //    attachment. The token proves a human passed Turnstile within the last 24
    //    hours, and its signed `sid` is the quota bucket — which is why the bucket
    //    cannot be reset by clearing a cookie.
    let sid = attachment.sid
    if (!sid) {
      const verified = await this.verify(msg.token)
      if (!verified) {
        this.reject(ws, idx, previous, 'UNAUTHORIZED', 'Verifikasi dulu ya sebelum menggambar.')
        return
      }
      sid = verified
      attachment.sid = sid
      ws.serializeAttachment(attachment)
    }

    // 2. Cooldown. Per connection, from the attachment, so eviction cannot reset it.
    const sinceLast = now - attachment.lastPlacedAt
    if (attachment.lastPlacedAt > 0 && sinceLast < PLACE_COOLDOWN_MS) {
      this.reject(ws, idx, previous, 'COOLDOWN', 'Sabar sedikit, satu piksel per 1,5 detik.', {
        retryAfterMs: PLACE_COOLDOWN_MS - sinceLast,
      })
      return
    }

    // From here down every statement is synchronous, so this whole block runs without
    // interleaving. That is what makes read-check-increment atomic; introducing an
    // `await` between the check and the write would reintroduce exactly the race the
    // Durable Object exists to remove.
    const day = utcDayKey(now)
    if (day !== this.budgetDay) {
      this.pruneStaleCounters()
    }

    // 3. Per-session daily quota.
    const used = this.readQuota(sid, day)
    if (used >= SESSION_DAILY_QUOTA) {
      this.reject(
        ws,
        idx,
        previous,
        'QUOTA_EXHAUSTED',
        `Kuota harian ${SESSION_DAILY_QUOTA} piksel sudah habis. Balik lagi setelah 00:00 UTC ya.`,
      )
      return
    }

    // 4. Global daily budget. Checked last so it is only ever reported to someone who
    //    would otherwise have been allowed to paint.
    const writes = this.readBudget(day)
    if (writes >= GLOBAL_DAILY_BUDGET) {
      this.reject(
        ws,
        idx,
        previous,
        'BUDGET_EXHAUSTED',
        'Kanvas jadi read-only sampai 00:00 UTC — budget edge hari ini sudah terpakai.',
      )
      // Everyone needs to know, not just the visitor who happened to hit it.
      this.broadcast({ op: 'budget', readOnly: true })
      return
    }

    // Accepted. Memory and storage together, both synchronous.
    this.board[idx] = color
    this.ctx.storage.sql.exec(
      `INSERT INTO board (idx, color, sid, placed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (idx) DO UPDATE SET color = excluded.color, sid = excluded.sid, placed_at = excluded.placed_at`,
      idx,
      color,
      sid,
      now,
    )
    const nowUsed = this.bumpQuota(sid, day)
    this.bumpBudget(day)

    attachment.lastPlacedAt = now
    ws.serializeAttachment(attachment)

    this.send(ws, {
      op: 'accept',
      idx,
      color,
      remaining: Math.max(0, SESSION_DAILY_QUOTA - nowUsed),
    })

    // The painter already applied this optimistically, so they are excluded.
    this.broadcast({ op: 'pixel', idx, color }, ws)
  }

  webSocketClose(ws: WebSocket): void {
    this.broadcastPresence(ws, 'leaving')
  }

  webSocketError(ws: WebSocket): void {
    this.broadcastPresence(ws, 'leaving')
  }

  // --- Counters --------------------------------------------------------------

  private readQuota(sid: string, day: string): number {
    const row = this.ctx.storage.sql
      .exec<{ used: number }>('SELECT used FROM quota WHERE sid = ? AND day = ?', sid, day)
      .toArray()[0]
    return row?.used ?? 0
  }

  private bumpQuota(sid: string, day: string): number {
    const row = this.ctx.storage.sql
      .exec<{ used: number }>(
        `INSERT INTO quota (sid, day, used) VALUES (?, ?, 1)
         ON CONFLICT (sid, day) DO UPDATE SET used = used + 1
         RETURNING used`,
        sid,
        day,
      )
      .toArray()[0]
    return row?.used ?? 1
  }

  private readBudget(day: string): number {
    const row = this.ctx.storage.sql
      .exec<{ writes: number }>('SELECT writes FROM budget WHERE day = ?', day)
      .toArray()[0]
    return row?.writes ?? 0
  }

  private bumpBudget(day: string): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO budget (day, writes) VALUES (?, 1)
       ON CONFLICT (day) DO UPDATE SET writes = writes + 1`,
      day,
    )
  }

  private isReadOnly(now: number): boolean {
    return this.readBudget(utcDayKey(now)) >= GLOBAL_DAILY_BUDGET
  }

  // --- Helpers ---------------------------------------------------------------

  /**
   * Verifies a session token and returns its signed `sid`.
   *
   * Reuses the token `POST /api/session` already mints for chat, deliberately rather
   * than adding a second credential: it is exactly the property the canvas needs
   * ("a human solved Turnstile recently"), it is already wired into the frontend, and
   * `verifySessionToken` already checks the signature, the expiry and the scope.
   *
   * That scope is `'chat'`, which now reads as a slight misnomer — it means "minted by
   * /api/session", not "may only call /api/chat". If the two ever need to diverge, the
   * seam is the `scope` field in `token.service.ts`; splitting it pre-emptively would
   * mean a second Turnstile challenge for the same visitor and no security gained.
   */
  private async verify(token: unknown): Promise<string | null> {
    // The secret is checked before the token, and the order is load-bearing: where no
    // secret is configured there is nothing for a token to be verified against, so
    // requiring one would reject every caller for failing to supply a credential that
    // could not be checked anyway.
    const secret = this.env.SESSION_SECRET || this.env.TURNSTILE_SECRET_KEY
    if (!secret) {
      // Nothing to verify against, so the token is ignored and the connection gets an
      // identity of its own instead.
      //
      // This mirrors `routes/chat.ts`, which skips session checks entirely under the
      // same condition, and it is the difference between a feature that works on a
      // fresh clone and one that silently refuses every click until someone discovers
      // it wanted a `.dev.vars`. There is nothing to forge here either: where no
      // secret exists, no signature can be checked, so demanding one would reject
      // honest callers and stop nobody.
      //
      // What is given up is only the *durability* of the quota bucket — a reconnect
      // earns a fresh 150. The cooldown and the global daily budget are unaffected,
      // and the budget is the limit that actually protects the free tier. Production
      // sets `TURNSTILE_SECRET_KEY` for the guestbook, so this path is local-only in
      // practice; if a deploy ever hits it, that warning is the thing to search for.
      if (!this.warnedMissingSecret) {
        this.warnedMissingSecret = true
        console.warn(
          'PixelCanvas: no SESSION_SECRET or TURNSTILE_SECRET_KEY bound — quota is per-connection, not per-session',
        )
      }
      return `anon:${crypto.randomUUID()}`
    }

    if (typeof token !== 'string' || !token) return null

    // IP binding is intentionally not enforced here. `verifySessionToken` compares the
    // caller's IP hash when given one, but a WebSocket outlives the request that
    // opened it and a mobile visitor changing networks mid-session would be silently
    // unable to paint. The token's signature and expiry are what matter.
    const result = await verifySessionToken(token, secret)
    return result.valid ? (result.payload?.sid ?? null) : null
  }

  private readAttachment(ws: WebSocket): SocketAttachment {
    const raw: unknown = ws.deserializeAttachment()

    if (typeof raw === 'object' && raw !== null) {
      const candidate = raw as Partial<SocketAttachment>
      return {
        sid: typeof candidate.sid === 'string' ? candidate.sid : null,
        lastPlacedAt: typeof candidate.lastPlacedAt === 'number' ? candidate.lastPlacedAt : 0,
      }
    }

    // A socket accepted by an older version of this class, or an attachment that
    // failed to deserialise. Treating it as a fresh anonymous connection costs the
    // visitor one re-verification and cannot corrupt anything.
    return { sid: null, lastPlacedAt: 0 }
  }

  /** Packs the board as base64. 4 KiB in, ~5.5 KB out, one message. */
  private packBoard(): string {
    let binary = ''
    const CHUNK = 0x2000
    for (let offset = 0; offset < this.board.length; offset += CHUNK) {
      binary += String.fromCharCode(...this.board.subarray(offset, offset + CHUNK))
    }
    return btoa(binary)
  }

  private reject(
    ws: WebSocket,
    idx: number,
    previous: number,
    code: RejectCode,
    message: string,
    extra?: { retryAfterMs?: number },
  ): void {
    this.send(ws, { op: 'reject', code, message, idx, previous, ...extra })
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // The socket closed between being listed and being written to. Nothing to do
      // and nothing worth logging — `webSocketClose` will reconcile presence.
    }
  }

  /** Sends to every connected socket except `exclude`. Costs no billed requests. */
  private broadcast(message: ServerMessage, exclude?: WebSocket): void {
    const payload = JSON.stringify(message)
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude) continue
      try {
        socket.send(payload)
      } catch {
        // As in `send`: a socket mid-close. Skip it.
      }
    }
  }

  /**
   * Broadcasts the connection count to everyone except `subject`.
   *
   * `subject` is never a recipient either way — a joiner already has the count in its
   * snapshot, and a leaver is on its way out — but whether it is *counted* differs, and
   * conflating the two is a bug worth naming because it looks like one condition:
   *
   * - `'joining'`: `getWebSockets()` already includes the new socket, so it counts. A
   *   second tab must make the first read 2, which is the one number a visitor can
   *   check by hand.
   * - `'leaving'`: `getWebSockets()` *still* lists a socket while its close handler
   *   runs, so it must be discounted, or presence reads one too many until the next
   *   change.
   */
  private broadcastPresence(subject: WebSocket, role: 'joining' | 'leaving'): void {
    const others = this.ctx.getWebSockets().filter((s) => s !== subject)
    const count = role === 'joining' ? others.length + 1 : others.length

    const payload = JSON.stringify({ op: 'presence', count } satisfies ServerMessage)
    for (const socket of others) {
      try {
        socket.send(payload)
      } catch {
        // Skip, as above.
      }
    }
  }
}
