CREATE TABLE IF NOT EXISTS design_color_schemes (id TEXT PRIMARY KEY, brief_id TEXT NOT NULL, name TEXT NOT NULL, palette_json TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_preset INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE INDEX IF NOT EXISTS idx_dcs_brief ON design_color_schemes(brief_id, sort_order);
