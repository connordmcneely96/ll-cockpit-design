"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChatPane from "./ChatPane";
import FileTree from "./FileTree";
import CodeViewer from "./CodeViewer";
import type { BriefDetail, Brief } from "./page";

type Props = {
  briefId: string;
  detail: BriefDetail;
  token: string;
};

export default function CanvasClient({ briefId, detail, token }: Props) {
  const router = useRouter();
  const { brief, subtasks, run } = detail;
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const displayName = brief.client_name || "Untitled design";

  // Progress: 0–100 based on subtasks done/total
  const progress =
    run && run.subtasks_total > 0
      ? Math.round((run.subtasks_done / run.subtasks_total) * 100)
      : brief.status === "done"
      ? 100
      : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--design-bg)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Canvas header */}
      <header
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          borderBottom: "1px solid var(--design-border)",
          background: "var(--design-bg)",
          flexShrink: 0,
          gap: 12,
        }}
      >
        {/* Back */}
        <button
          onClick={() => router.push("/design")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--design-ink3)",
            fontSize: 18,
            lineHeight: 1,
            padding: "4px 6px",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
          }}
          title="Back to Design Build"
        >
          ←
        </button>

        {/* Brief name */}
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--design-ink)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 260,
          }}
        >
          {displayName}
        </span>

        {/* Status badge */}
        <StatusBadge status={brief.status} progress={progress} />

        <div style={{ flex: 1 }} />

        {/* Iteration indicator */}
        {brief.current_iteration && brief.current_iteration > 1 && (
          <span style={{ fontSize: 12, color: "var(--design-ink3)" }}>
            v{brief.current_iteration}
          </span>
        )}
      </header>

      {/* Progress bar — visible while building */}
      {brief.status === "building" && (
        <div
          style={{
            height: 2,
            background: "var(--design-border)",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background: "var(--design-terracotta)",
              transition: "width 0.6s ease",
            }}
          />
        </div>
      )}

      {/* Body — 30/70 split */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left: Chat pane ~32% */}
        <div
          style={{
            width: "32%",
            minWidth: 280,
            maxWidth: 420,
            borderRight: "1px solid var(--design-border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <ChatPane
            briefId={briefId}
            brief={brief}
            subtasks={subtasks}
            run={run ?? null}
            token={token}
          />
        </div>

        {/* Right: File tree + code viewer ~68% */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* File tree sidebar */}
          <div
            style={{
              width: 200,
              borderRight: "1px solid var(--design-border)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              flexShrink: 0,
            }}
          >
            <FileTree selectedFile={selectedFile} onSelectFile={setSelectedFile} />
          </div>

          {/* Code viewer main area */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <CodeViewer selectedFile={selectedFile} briefStatus={brief.status} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  progress,
}: {
  status: Brief["status"];
  progress: number;
}) {
  const map: Record<Brief["status"], { label: string; color: string; bg: string }> = {
    building: { label: `Building${progress > 0 ? ` ${progress}%` : "…"}`, color: "#b45309", bg: "#fef3c7" },
    done: { label: "Done", color: "#166534", bg: "#dcfce7" },
    error: { label: "Error", color: "#991b1b", bg: "#fee2e2" },
  };
  const { label, color, bg } = map[status] ?? map.building;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        color,
        background: bg,
        borderRadius: 999,
        padding: "2px 8px",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// Re-export type so child components can import it without circular dep
export type { Brief } from "./page";
