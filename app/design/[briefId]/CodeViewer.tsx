"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { DesignFile } from "./FileTree";

/**
 * Sprint 18O — Monaco editor replaces the <pre> code block.
 * Loaded dynamically with ssr:false — Monaco uses browser-only APIs
 * (ResizeObserver, workers, DOM measurements) and cannot run on the edge.
 * The <pre> fallback renders while Monaco initialises from CDN.
 */
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false },
);

function monacoLanguage(type: DesignFile["type"]): string {
  const map: Record<DesignFile["type"], string> = {
    html: "html",
    css: "css",
    jsx: "javascript",
    json: "json",
  };
  return map[type] ?? "plaintext";
}

type Props = {
  briefId: string;
  files: DesignFile[];
  selectedFile: string | null;
  briefStatus: "building" | "done" | "error";
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
          <MonacoBlock content={activeFile.content} type={activeFile.type} />
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

// Sprint 18O — Monaco editor pane
function MonacoBlock({
  content,
  type,
}: {
  content: string;
  type: DesignFile["type"];
}) {
  return (
    <div style={{ height: "100%", background: "#1e1e2e" }}>
      <MonacoEditor
        height="100%"
        language={monacoLanguage(type)}
        value={content}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineHeight: 19,
          wordWrap: "on",
          folding: true,
          lineNumbers: "on",
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          padding: { top: 16, bottom: 16 },
        }}
        loading={<CodeFallback content={content} />}
      />
    </div>
  );
}

// Fallback shown while Monaco loads from CDN — matches old <pre> style exactly
function CodeFallback({ content }: { content: string }) {
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
