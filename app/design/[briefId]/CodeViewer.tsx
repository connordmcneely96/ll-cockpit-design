"use client";

import { useState } from "react";
import type { DesignFile } from "./FileTree";

type Props = {
  briefId: string;
  files: DesignFile[];
  selectedFile: string | null;
  briefStatus: "building" | "done" | "error";
  // Sprint 16 v0.3 — bump this when the iteration agent re-uploads R2
  // (update_design_tokens, regenerate_section, save_iteration) so the
  // preview iframe cache-busts and reloads.
  refreshKey?: number;
};

type ViewMode = "code" | "preview";

export default function CodeViewer({
  briefId,
  files,
  selectedFile,
  briefStatus,
  refreshKey = 0,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("code");

  const file = files.find((f) => f.path === selectedFile) ?? null;
  const htmlFile = files.find((f) => f.type === "html") ?? null;

  if (!file && !htmlFile) {
    return <EmptyState briefStatus={briefStatus} />;
  }

  const activeFile = file ?? htmlFile!;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--design-paper)" }}>
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
          {activeFile.path}
        </span>

        <div style={{ display: "flex", border: "1px solid var(--design-border)", borderRadius: 6, overflow: "hidden" }}>
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

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {viewMode === "code" ? (
          <CodeBlock content={activeFile.content} />
        ) : (
          <PreviewFrame
            briefId={briefId}
            hasHtml={htmlFile !== null}
            refreshKey={refreshKey}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({ briefStatus }: { briefStatus: Props["briefStatus"] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "var(--design-paper)" }}>
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
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--design-ink)", marginBottom: 8 }}>
          {briefStatus === "building"
            ? "Your design is building…"
            : briefStatus === "error"
            ? "Build encountered an error"
            : "No files available yet"}
        </div>
        <div style={{ fontSize: 13, color: "var(--design-ink3)", lineHeight: 1.6 }}>
          {briefStatus === "building"
            ? "Files will appear in the tree as each section completes."
            : briefStatus === "error"
            ? "Use the chat to describe what went wrong and the agents will retry."
            : "Files populate from the pipeline output."}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        padding: 20,
        background: "#1e1e2e",
      }}
    >
      <pre
        style={{
          margin: 0,
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
          fontSize: 12,
          color: "#e4e4e7",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </pre>
    </div>
  );
}

function PreviewFrame({
  briefId,
  hasHtml,
  refreshKey,
}: {
  briefId: string;
  hasHtml: boolean;
  refreshKey: number;
}) {
  if (!hasHtml) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--design-bg2)",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--design-ink3)" }}>
          No HTML to preview yet
        </div>
      </div>
    );
  }

  // Sprint 16 v0.3 — cache-bust on refreshKey + key prop forces full iframe
  // remount, the only reliable way to force the browser to refetch.
  return (
    <iframe
      key={`preview-${refreshKey}`}
      src={`/design/preview/${briefId}?v=${refreshKey}`}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        background: "white",
      }}
      sandbox="allow-same-origin allow-scripts allow-popups"
      title="Design preview"
    />
  );
}
