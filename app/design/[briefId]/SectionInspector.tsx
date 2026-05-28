"use client";

import { useState, useEffect, useCallback } from "react";

type BlockSettingDef = { id: string; label?: string; default?: unknown };
type BlockDef = { type: string; name?: string; limit?: number; settings?: BlockSettingDef[] };
type BlockRow = { id: string; block_type: string; sort_order: number; settings_json: string | null };

type Props = {
  briefId: string;
  selectedSection: string | null;
  onClose: () => void;
  onApplied: () => void;
};

export default function SectionInspector({ briefId, selectedSection, onClose, onApplied }: Props) {
  const [instruction, setInstruction] = useState("");
  const [inflight, setInflight] = useState(false);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [blockDefs, setBlockDefs] = useState<BlockDef[]>([]);
  const [blockInflight, setBlockInflight] = useState<string | null>(null);

  const fetchBlocks = useCallback(async () => {
    if (!selectedSection) return;
    try {
      const res = await fetch(
        `/api/design/briefs/${briefId}/sections/${selectedSection}/blocks`,
      );
      if (!res.ok) return;
      const data = await res.json() as { blocks: BlockRow[]; blockDefs: BlockDef[] };
      setBlocks(data.blocks ?? []);
      setBlockDefs(data.blockDefs ?? []);
    } catch {
      // silently ignore
    }
  }, [briefId, selectedSection]);

  useEffect(() => {
    setBlocks([]);
    setBlockDefs([]);
    fetchBlocks();
  }, [fetchBlocks]);

  if (selectedSection === null) return null;

  async function handleApply() {
    if (!instruction.trim() || inflight) return;

    const message = `Use the regenerate_section tool with section_slug="${selectedSection}" and refinement="${instruction.trim()}". After regenerating, call save_iteration to commit the change. Apply the refinement to the "${selectedSection}" section only — do not touch any other section.`;

    setInflight(true);
    setErrorMsg(null);
    setAppliedMsg(null);

    try {
      const res = await fetch(`/api/design/briefs/${briefId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();

      if (res.ok && data.ok !== false) {
        setInstruction("");
        setAppliedMsg("Applied ✓");
        setTimeout(() => setAppliedMsg(null), 4000);
        onApplied();
      } else {
        setErrorMsg(data.error ?? `Request failed (${res.status})`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setInflight(false);
    }
  }

  async function handleAddBlock(blockType: string) {
    setBlockInflight(`add:${blockType}`);
    try {
      const res = await fetch(
        `/api/design/briefs/${briefId}/sections/${selectedSection}/blocks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ block_type: blockType }),
        },
      );
      if (res.ok) await fetchBlocks();
    } catch {
      // silently ignore
    } finally {
      setBlockInflight(null);
    }
  }

  async function handleRemoveBlock(blockId: string) {
    setBlockInflight(`remove:${blockId}`);
    try {
      const res = await fetch(
        `/api/design/briefs/${briefId}/sections/${selectedSection}/blocks/${blockId}`,
        { method: "DELETE" },
      );
      if (res.ok) await fetchBlocks();
    } catch {
      // silently ignore
    } finally {
      setBlockInflight(null);
    }
  }

  const showBlockList = blockDefs.length > 0;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        background: "white",
        borderLeft: "1px solid var(--design-border)",
        boxShadow: "-4px 0 16px rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid var(--design-border)",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--design-ink3)", flexShrink: 0 }}>
          Editing section
        </span>
        <code
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--design-ink)",
            background: "var(--design-bg)",
            borderRadius: 4,
            padding: "1px 6px",
            border: "1px solid var(--design-border)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {selectedSection}
        </code>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--design-ink3)",
            fontSize: 16,
            lineHeight: 1,
            padding: "2px 4px",
            borderRadius: 4,
            flexShrink: 0,
          }}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: "var(--design-ink3)", lineHeight: 1.5 }}>
          Describe the change you want for this section. It&apos;ll apply only to this section.
        </p>

        <textarea
          rows={5}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Make the heading larger and change the button color to orange"
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            fontSize: 13,
            lineHeight: 1.5,
            padding: "8px 10px",
            border: "1px solid var(--design-border)",
            borderRadius: 6,
            fontFamily: "inherit",
            color: "var(--design-ink)",
            background: "var(--design-bg)",
            outline: "none",
          }}
        />

        <button
          onClick={handleApply}
          disabled={!instruction.trim() || inflight}
          style={{
            background: inflight ? "var(--design-ink3)" : "var(--design-terracotta)",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 500,
            cursor: !instruction.trim() || inflight ? "not-allowed" : "pointer",
            opacity: !instruction.trim() ? 0.5 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {inflight ? "Applying…" : "Apply change"}
        </button>

        {appliedMsg && (
          <p style={{ margin: 0, fontSize: 12, color: "#166534", fontWeight: 500 }}>
            {appliedMsg}
          </p>
        )}

        {errorMsg && (
          <p style={{ margin: 0, fontSize: 12, color: "#991b1b" }}>
            {errorMsg}
          </p>
        )}

        {/* BlockList — only rendered when the section type has block definitions */}
        {showBlockList && (
          <div
            style={{
              borderTop: "1px solid var(--design-border)",
              paddingTop: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--design-ink3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Blocks
            </span>

            {/* Existing block rows */}
            {blocks.map((block) => {
              const def = blockDefs.find((d) => d.type === block.block_type);
              const removing = blockInflight === `remove:${block.id}`;
              return (
                <div
                  key={block.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    border: "1px solid var(--design-border)",
                    borderRadius: 6,
                    background: "var(--design-bg)",
                    opacity: removing ? 0.5 : 1,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 12, color: "var(--design-ink)", fontWeight: 500 }}>
                    {def?.name ?? block.block_type}
                  </span>
                  <button
                    onClick={() => handleRemoveBlock(block.id)}
                    disabled={removing || blockInflight !== null}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: removing || blockInflight !== null ? "not-allowed" : "pointer",
                      color: "var(--design-ink3)",
                      fontSize: 14,
                      lineHeight: 1,
                      padding: "2px 4px",
                      borderRadius: 3,
                      flexShrink: 0,
                    }}
                    title="Remove block"
                  >
                    ×
                  </button>
                </div>
              );
            })}

            {/* Add buttons for each block type under its limit */}
            {blockDefs.map((def) => {
              const count = blocks.filter((b) => b.block_type === def.type).length;
              const limit = def.limit ?? Infinity;
              if (count >= limit) return null;
              const adding = blockInflight === `add:${def.type}`;
              return (
                <button
                  key={def.type}
                  onClick={() => handleAddBlock(def.type)}
                  disabled={adding || blockInflight !== null}
                  style={{
                    background: "none",
                    border: "1px dashed var(--design-border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 12,
                    color: "var(--design-ink3)",
                    fontWeight: 500,
                    cursor: adding || blockInflight !== null ? "not-allowed" : "pointer",
                    textAlign: "left",
                  }}
                >
                  {adding ? "Adding…" : `+ Add ${def.name ?? def.type}`}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
