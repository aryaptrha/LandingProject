import { Hono } from 'hono'
import { readSiteConfig } from '../services/config.service'
import { error, success } from '../utils/response'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  PALETTE_SIZE,
  PLACE_COOLDOWN_MS,
  SESSION_DAILY_QUOTA,
} from '../types/canvas'
import type { AppEnv } from '../types/env'

const canvas = new Hono<AppEnv>()

/**
 * The one board everybody shares.
 *
 * `idFromName` is deterministic, so every request in every colo resolves to the same
 * object — which is the point: a name-derived id is how you get *one* shared actor
 * rather than one per caller. Versioned so a future incompatible board format can
 * start clean instead of migrating pixels.
 */
const BOARD_NAME = 'board-v1'

/** Both routes need the same binding check and the same kill-switch check. */
async function resolveBoard(env: AppEnv['Bindings'] | undefined) {
  if (!env?.CANVAS) {
    return {
      stub: null,
      failure: error(
        'The pixel canvas is not configured for this worker. Missing binding: CANVAS (Durable Object). See docs/DATA.md.',
        'CANVAS_UNAVAILABLE',
        503,
      ),
    } as const
  }

  const config = await readSiteConfig(env.CACHE)
  if (!config.canvasEnabled) {
    return {
      stub: null,
      failure: error(
        config.canvasNotice ?? 'Kanvas sedang dimatikan sementara.',
        'CANVAS_DISABLED',
        503,
      ),
    } as const
  }

  return { stub: env.CANVAS.get(env.CANVAS.idFromName(BOARD_NAME)), failure: null } as const
}

/**
 * GET /api/canvas
 *
 * The board over plain HTTP, plus the constants the client needs to render and to
 * describe its own limits.
 *
 * This exists so the panel is never blank. A WebSocket is blocked by some corporate
 * proxies and by a few privacy extensions, and the artwork is the point of the
 * feature — so where the socket cannot open, this still renders the board read-only
 * rather than showing an error where a picture should be.
 *
 * The limits are served rather than hardcoded in the bundle so a change to
 * `SESSION_DAILY_QUOTA` does not need a frontend rebuild to be described accurately.
 * A UI that promises the wrong number is worse than one that asks.
 */
canvas.get('/canvas', async (c) => {
  const { stub, failure } = await resolveBoard(c.env)
  if (failure) return failure

  try {
    const response = await stub.fetch('https://canvas.internal/snapshot')
    if (!response.ok) {
      return error('Gagal membaca kanvas.', 'CANVAS_READ_FAILED', 502)
    }

    const snapshot = (await response.json()) as {
      board: string
      presence: number
      readOnly: boolean
      now: number
    }

    return success({
      ...snapshot,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      paletteSize: PALETTE_SIZE,
      cooldownMs: PLACE_COOLDOWN_MS,
      dailyQuota: SESSION_DAILY_QUOTA,
    })
  } catch (err) {
    console.error('Canvas snapshot failed:', err)
    return error('Gagal membaca kanvas.', 'CANVAS_READ_FAILED', 502)
  }
})

/**
 * GET /api/canvas/socket
 *
 * Upgrades to the board's WebSocket. Everything after the handshake is handled inside
 * the Durable Object, including authentication — the upgrade itself is anonymous so a
 * visitor can watch the board without solving a Turnstile challenge first, and the
 * signed session token travels with the first `place` message instead.
 *
 * The request is forwarded rather than answered here: only the object can call
 * `acceptWebSocket`, and only it holds the board.
 */
canvas.get('/canvas/socket', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    return error('Expected a WebSocket upgrade.', 'UPGRADE_REQUIRED', 426)
  }

  const { stub, failure } = await resolveBoard(c.env)
  if (failure) return failure

  // `c.req.raw` and not a reconstructed Request: the upgrade headers have to survive
  // intact, and rebuilding one is how you lose `Sec-WebSocket-Key`.
  return stub.fetch(c.req.raw)
})

export { canvas }
