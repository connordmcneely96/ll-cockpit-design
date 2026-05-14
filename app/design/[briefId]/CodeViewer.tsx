"use client";

import { useState } from "react";

type Props = {
  selectedFile: string | null;
  briefStatus: "building" | "done" | "error";
};

type ViewMode = "code" | "preview";

export default function CodeViewer({ selectedFile, briefStatus }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("code");

  // Empty state — no file selected or design still building
  if (!selectedFile) {
    return (
      <EmptyState briefStatus={briefStatus} />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--design-paper)",
      }}
    >
      {/* Viewer header */}
      <div
        style={{
          height: 40,
          borderBottom: "1px solid var(--design-border)",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* File path */}
        <span
          style={{
            fontSize: 12,
            color: "var(--design-ink2)",
            fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selectedFile}
        </span>

        {/* Code / Preview toggle */}
        <div
          style={{
            display: "flex",
            border: "1px solid var(--design-border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {(["code", "preview"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                background: viewMode === mode ? "var(--design-bg2)" : "transparent",
                border: "none",
                borderRight: mode === "code" ? "1px solid var(--design-border)" : "none",
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: viewMode === mode ? 500 : 400,
                color: viewMode === mode ? "var(--design-ink)" : "var(--design-ink3)",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {viewMode === "code" ? (
          <CodePlaceholder selectedFile={selectedFile} />
        ) : (
          <PreviewPlaceholder />
        )}
      </div>
    </div>
  );
}

function EmptyState({ briefStatus }: { briefStatus: Props["briefStatus"] }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        background: "var(--design-paper)",
      }}
    >
      <div
        style={{
          border: "1.5px dashed var(--design-border)",
          borderRadius: 12,
          padding: "40px 48px",
          textAlign: "center",
          maxWidth: 340,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>
          {briefStatus === "building" ? "⏳" : briefStatus === "error" ? "⚠️" : "📄"}
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--design-ink)",
            marginBottom: 8,
          }}
        >
          {briefStatus === "building"
            ? "Your design is building…"
            : briefStatus === "error"
            ? "Build encountered an error"
            : "Select a file to view"}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--design-ink3)",
            lineHeight: 1.6,
          }}
        >
          {briefStatus === "building"
            ? "Files will appear in the tree as each section completes. You can ask for changes in the chat while it builds."
            : briefStatus === "error"
            ? "Use the chat to describe what went wrong and the agents will retry."
            : "Click a file in the left panel to view its code or preview it in an iframe."}
        </div>

        {/* Drop zone indicator */}
        <div
          style={{
            marginTop: 20,
            border: "1px dashed var(--design-border)",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 12,
            color: "var(--design-ink3)",
          }}
        >
          ↑ DROP FILES to import assets
        </div>
      </div>
    </div>
  );
}

function CodePlaceholder({ selectedFile }: { selectedFile: string }) {
  const ext = selectedFile.split(".").pop() ?? "";
  const commentMap: Record<string, string> = {
    html: "<!-- File content loads here in Sprint 18C when design_brief_files is wired -->",
    jsx: "// File content loads here in Sprint 18C when design_brief_files is wired",
    css: "/* File content loads here in Sprint 18C when design_brief_files is wired */",
  };
  const placeholder = commentMap[ext] ?? "// File content loads here in Sprint 18C";

  return (
    <div
      style={{
        height: "100%",
        overflowY: "auto",
        padding: 20,
        background: "#1e1e2e",
      }}
    >
      <pre
        style={{
          margin: 0,
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
          fontSize: 13,
          color: "#6b7280",
          lineHeight: 1.7,
        }}
      >
        {placeholder}
      </pre>
    </div>
  );
}

function PreviewPlaceholder() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--design-bg2)",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 13, color: "var(--design-ink3)" }}>
        Preview iframe loads in Sprint 18C
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--design-ink3)",
          opacity: 0.6,
        }}
      >
        HTML output renders here once design_brief_files is wired
      </div>
    </div>
  );
}
