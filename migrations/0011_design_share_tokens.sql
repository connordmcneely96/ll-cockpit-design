-- Migration 0011 — Sprint 18C
-- design_share_tokens: tenant-scoped, owner-revocable, expiring share links
-- for clients to view brief previews without an LL Cockpit account.
--
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e) on
-- May 14, 2026 via Cloudflare D1 MCP (out-of-band, not via wrangler migrations).
-- This file exists for repo history and future replay only.

CREATE TABLE IF NOT EXISTS design_share_tokens (
  token TEXT PRIMARY KEY,                  -- 32-char URL-safe random
  brief_id TEXT NOT NULL,
  iteration_number INTEGER,                -- null = always latest, number = pinned
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,                      -- null = no expiry
  revoked_at INTEGER,                      -- null = active
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_brief
  ON design_share_tokens(brief_id);

CREATE INDEX IF NOT EXISTS idx_share_tokens_active
  ON design_share_tokens(brief_id, revoked_at);
