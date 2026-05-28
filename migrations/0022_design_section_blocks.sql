-- Migration 0022 — Sprint 119E
-- design_section_blocks: block instances per brief section
--
-- Applied to ll-cockpit-db (831eeccf-60bc-4378-8a3b-71dfb910756e).
-- block_type references the type field in design_section_types.schema_json.blocks[].
-- settings_json is a JSON object keyed by setting.id with default values.

CREATE TABLE IF NOT EXISTS design_section_blocks (id TEXT PRIMARY KEY, brief_section_id TEXT NOT NULL, block_type TEXT NOT NULL, sort_order INTEGER NOT NULL, settings_json TEXT, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE INDEX IF NOT EXISTS idx_dsb_section ON design_section_blocks(brief_section_id, status, sort_order);
