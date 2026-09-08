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
import { readSessionId } from '../services/session.service'
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
   * Guards the anonymous-connection warning so it is logged once per object lifetime
   * rather than once per placement. A warning on every click is a warning nobody reads,
   * and on a hibernating object "once per lifetime" is already generous.
   */
  private warnedAnonymous = false

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

    // Identity is resolved here, from the `ap_sid` cookie the document response already
    // set on this visitor. Doing it at upgrade time rather than on the first placement is
    // what makes painting work with no verification step: the cookie rides along on the
    // handshake (a WebSocket upgrade is an HTTP request, and HttpOnly only stops scripts
    // reading a cookie, not the browser sending it), so by the time anyone clicks, the
    // quota bucket already exists.
    //
    // `sid:` prefixed so a cookie-derived bucket can never collide with a token-derived
    // one, which is a bare UUID from a different issuer.
    const cookieSid = readSessionId(request)
    const attachment: SocketAttachment = {
      sid: cookieSid ? `sid:${cookieSid}` : null,
      lastPlacedAt: 0,
    }
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

    // 1. Identity, resolved once per connection and then cached in the attachment.
    //    Usually already present from the upgrade's cookie; this covers the client that
    //    sent no cookie and may be offering a token instead. It cannot fail — there is
    //    always a bucket to attribute the pixel to — so there is no rejection here.
    let sid = attachment.sid
    if (!sid) {
      sid = await this.resolveSid(msg.token)
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
   * Resolves the quota bucket for a connection that arrived without an `ap_sid` cookie.
   *
   * Never returns null, and that is the point. An earlier version demanded a
   * Turnstile-minted token here and rejected the placement without one, which was wrong
   * twice over: the panel has no Turnstile widget, so the visitor was told to verify with
   * no way to do it; and in production, where a real `TURNSTILE_SECRET_KEY` is set for the
   * guestbook, *every* placement failed, because completing the guestbook's challenge
   * mints nothing reusable — its token is single-use and the widget resets after each
   * submit. A gate nobody can pass is not security, it is a broken feature.
   *
   * So the order is: the cookie (handled at upgrade), else a token if the visitor happens
   * to carry one from the chat, else an identity of this connection's own. Each step down
   * costs only the *durability* of the 150/day bucket, never the cooldown and never the
   * global budget — and the budget is the limit that actually protects the free tier.
   */
  private async resolveSid(token: unknown): Promise<string> {
    // A token is only worth checking if there is something to check it against. Where no
    // secret is bound there is no signature to verify, so demanding one would reject
    // honest callers and stop nobody — the same reasoning `routes/chat.ts` applies when
    // it skips session checks under this condition.
    const secret = this.env.SESSION_SECRET || this.env.TURNSTILE_SECRET_KEY

    if (secret && typeof token === 'string' && token) {
      // IP binding is intentionally not enforced. `verifySessionToken` compares the
      // caller's IP hash when given one, but a WebSocket outlives the request that opened
      // it, and a mobile visitor changing networks mid-session would be silently unable to
      // paint. The signature and the expiry are what matter.
      const result = await verifySessionToken(token, secret)
      const verified = result.valid ? result.payload?.sid : null
      if (verified) return verified
      // An invalid or expired token falls through rather than rejecting. It is the same
      // situation as no token at all, and the visitor did nothing wrong.
    }

    // No cookie and no usable token: a client with cookies disabled, or a non-browser.
    // It paints, from a bucket that lasts as long as the connection does.
    if (!this.warnedAnonymous) {
      this.warnedAnonymous = true
      console.warn('PixelCanvas: connection with no ap_sid cookie — quota is per-connection')
    }
    return `anon:${crypto.randomUUID()}`
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
