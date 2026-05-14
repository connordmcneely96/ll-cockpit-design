-- Migration 0012 — Sprint 18D
-- design_briefs: add skill_hint + project_type
--
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e) on
-- May 14, 2026 via Cloudflare D1 MCP (out-of-band).
-- This file exists for repo history and future replay only.
--
-- skill_hint: one of hi_fi_design | wireframe | interactive_prototype |
--             make_a_deck | frontend_design (selected via skills chips)
-- project_type: one of prototype | slide-deck | from-template | other
--               (left pane tab selection)

ALTER TABLE design_briefs ADD COLUMN skill_hint TEXT;
ALTER TABLE design_briefs ADD COLUMN project_type TEXT;
