import { fetchUpstream, type UpstreamResult } from '../gateway/upstream'

/**
 * The Garmin sync, seen from this worker.
 *
 * The sync itself is a GitHub Actions workflow in the persona backend's repo: it
 * pulls running stats from Garmin Connect into the backend's KV, which is where
 * the chat reads them. This file starts that workflow and reports on its runs.
 * Everything GitHub-shaped stops here; `routes/garminSync.ts` and the browser only
 * ever see a `SyncRun`.
 */

const API = 'https://api.github.com'
const REPO = 'aryaptrha/personal-chat'
const WORKFLOW = 'garmin-sync.yml'
const REF = 'main'

/** Shortest `OWNER_KEY` the routes will accept; see `Env.OWNER_KEY`. */
export const MIN_OWNER_KEY_LENGTH = 32

export type SyncState = 'queued' | 'running' | 'success' | 'failure'

export interface SyncRun {
  id: number
  state: SyncState
  /** When GitHub created the run, ISO 8601. */
  startedAt: string
  /** Last change of state; for a finished run, when it finished. ISO 8601. */
  updatedAt: string
  /** The run's page on GitHub, where its log is. */
  url: string
}

/** What a GitHub call needs from the request it is serving. */
export interface GitHubContext {
  token: string
  kv?: KVNamespace | undefined
  waitUntil?: ((promise: Promise<unknown>) => void) | undefined
}

/** The fields of a GitHub workflow run read here. */
interface GitHubRun {
  id: number
  status: string | null
  conclusion: string | null
  created_at: string
  updated_at: string
  html_url: string
}

/**
 * Collapses GitHub's status and conclusion into the four states the UI shows.
 *
 * Only `completed` is final. queued, waiting, pending, requested — and anything
 * GitHub adds later — all mean "not started yet" to someone waiting on a button.
 * Every conclusion other than success (cancelled, timed_out, skipped, …) is a
 * failure here, since none of them produced fresh stats.
 */
export function syncState(status: string | null, conclusion: string | null): SyncState {
  if (status === 'completed') return conclusion === 'success' ? 'success' : 'failure'
  if (status === 'in_progress') return 'running'
  return 'queued'
}

function toSyncRun(run: GitHubRun): SyncRun {
  return {
    id: run.id,
    state: syncState(run.status, run.conclusion),
    startedAt: run.created_at,
    updatedAt: run.updated_at,
    url: run.html_url,
  }
}

/**
 * Constant-time comparison of a presented owner key against the configured one.
 *
 * MACs a fixed message under the expected key, then asks WebCrypto to verify
 * that MAC under the presented key. `verify` compares in constant time — the
 * same primitive `token.service.ts` relies on — and the two MACs match only when
 * the keys do. A plain `===` would return early at the first differing character.
 * (Workers' `timingSafeEqual` is not in the DOM typings this tsconfig resolves.)
 */
export async function ownerKeyMatches(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const message = encoder.encode('owner-key')
  const hmacKey = (secret: string, usage: KeyUsage) =>
    crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      [usage],
    )

  const expectedMac = await crypto.subtle.sign('HMAC', await hmacKey(expected, 'sign'), message)
  return crypto.subtle.verify('HMAC', await hmacKey(provided, 'verify'), expectedMac, message)
}

function callGitHub<T>(
  ctx: GitHubContext,
  path: string,
  init: RequestInit = {},
): Promise<UpstreamResult<T>> {
  return fetchUpstream<T>('github', `${API}/repos/${REPO}${path}`, {
    kv: ctx.kv,
    waitUntil: ctx.waitUntil,
    init: {
      ...init,
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        // GitHub rejects API requests that carry no User-Agent.
        'User-Agent': 'aryaptrha-portfolio',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    },
  })
}

function mapResult<A, B>(result: UpstreamResult<A>, map: (data: A) => B): UpstreamResult<B> {
  return result.ok ? { ...result, data: map(result.data) } : result
}

/** The workflow's most recent run, or null if it has never run. */
export async function fetchLatestRun(ctx: GitHubContext): Promise<UpstreamResult<SyncRun | null>> {
  const result = await callGitHub<{ workflow_runs?: GitHubRun[] }>(
    ctx,
    `/actions/workflows/${WORKFLOW}/runs?per_page=1`,
  )
  return mapResult(result, (data) => {
    const run = data.workflow_runs?.[0]
    return run ? toSyncRun(run) : null
  })
}

export async function fetchRun(ctx: GitHubContext, id: number): Promise<UpstreamResult<SyncRun>> {
  return mapResult(await callGitHub<GitHubRun>(ctx, `/actions/runs/${id}`), toSyncRun)
}

/**
 * Starts the workflow on `main`.
 *
 * Resolves to the new run's id and page, or null when GitHub answered the older
 * way — a 204 with no body — and the caller has to find the run by time instead.
 */
export async function dispatchSync(
  ctx: GitHubContext,
): Promise<UpstreamResult<{ id: number; url: string } | null>> {
  const result = await callGitHub<{ workflow_run_id?: number; html_url?: string } | null>(
    ctx,
    `/actions/workflows/${WORKFLOW}/dispatches`,
    { method: 'POST', body: JSON.stringify({ ref: REF }) },
  )
  return mapResult(result, (data) =>
    data?.workflow_run_id ? { id: data.workflow_run_id, url: data.html_url ?? '' } : null,
  )
}
