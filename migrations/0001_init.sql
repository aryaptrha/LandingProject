-- 0001_init.sql — initial schema for the edge data layer.
--
-- Applied with `npm run db:migrate` (local) / `npm run db:migrate:remote` (production).
-- See docs/DATA.md for the full picture of what lives in D1 versus KV.
--
-- Two conventions hold across every table here.
--
-- Timestamps are INTEGER epoch milliseconds, not ISO-8601 TEXT. Range filters
-- ("visits in the last 24h") and keyset pagination then compare integers instead
-- of 24-byte strings, and there is no format or timezone ambiguity to get wrong.
-- The service layer converts to ISO-8601 on the way out, so API responses still
-- look like the rest of /api/*.
--
-- No raw IP address is stored anywhere, on purpose. Abuse control keys on a
-- salted hash of the IP that lives only in KV and expires with its window, so
-- the durable tables keep nothing that identifies a person beyond the coarse geo
-- Cloudflare already puts on the request.

-- Visitor-submitted guestbook entries. Append-only: nothing is ever deleted, and
-- moderation flips `status` instead.
CREATE TABLE IF NOT EXISTS guestbook_entries (
  id            TEXT    PRIMARY KEY,
  display_name  TEXT    NOT NULL,
  message       TEXT    NOT NULL,
  avatar_id     TEXT    NOT NULL,

  -- Coarse geo copied off request.cf at write time. Nullable because miniflare
  -- leaves `cf` sparse in local dev, and these are decoration, not keys.
  country       TEXT,
  city          TEXT,
  colo          TEXT,

  -- Soft moderation. Flipping a row to 'hidden' drops it out of every read path
  -- and every aggregate without a deploy and without losing the evidence:
  --   UPDATE guestbook_entries SET status = 'hidden' WHERE id = '...';
  status        TEXT    NOT NULL DEFAULT 'visible',

  -- Opaque session id from the ap_sid cookie. Groups a person's own entries;
  -- carries no authority, so a forged value gains nothing.
  session_id    TEXT,

  created_at    INTEGER NOT NULL,

  CHECK (status IN ('visible', 'hidden')),
  -- Belt-and-braces behind the service-layer validation. length() counts
  -- characters, and the service caps on code points, so a request that passes
  -- validation can never trip these.
  CHECK (length(display_name) BETWEEN 1 AND 32),
  CHECK (length(message) BETWEEN 1 AND 280)
);

-- Serves the one list query this table has: visible entries, newest first,
-- keyset-paginated on (created_at, id). Column order is load-bearing — `status`
-- is an equality filter so it must lead, otherwise the sort columns behind it
-- are unusable and SQLite falls back to a scan plus a temp B-tree sort.
CREATE INDEX IF NOT EXISTS idx_guestbook_visible
  ON guestbook_entries (status, created_at DESC, id DESC);

-- One row per visitor session (the ap_sid cookie), upserted on each new visit.
-- Cheaper to count than DISTINCT over the event log, which is why "unique
-- visitors" reads from here.
CREATE TABLE IF NOT EXISTS visitor_sessions (
  id          TEXT    PRIMARY KEY,
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1,
  country     TEXT,
  city        TEXT,
  colo        TEXT
);

-- Append-only visit log. INTEGER PRIMARY KEY AUTOINCREMENT rather than a random
-- id: nothing outside the database references these rows, and the rowid alias
-- keeps inserts cheap and the table compact.
--
-- Writes are deduplicated per session by a KV key with a TTL before they ever
-- reach here (see services/insights.service.ts), so this grows per visit rather
-- than per poll of /api/visitor.
CREATE TABLE IF NOT EXISTS visit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  country    TEXT,
  city       TEXT,
  colo       TEXT,
  continent  TEXT,
  created_at INTEGER NOT NULL
);

-- Supports the "last 24h" range filter. The GROUP BY country/colo aggregates
-- deliberately get no index: they touch every row by definition, so an index
-- would only add write cost. Their expense is handled by caching the result in
-- KV instead.
CREATE INDEX IF NOT EXISTS idx_visit_events_created
  ON visit_events (created_at DESC);
