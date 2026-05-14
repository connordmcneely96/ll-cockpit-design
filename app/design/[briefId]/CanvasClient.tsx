"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ChatPane from "./ChatPane";
import FileTree, { type DesignFile } from "./FileTree";
import CodeViewer from "./CodeViewer";
import ShareModal from "./ShareModal";
import type { BriefDetail, Brief, Subtask } from "./page";

type Props = {
  briefId: string;
  detail: BriefDetail;
  token: string;
};

export default function CanvasClient({ briefId, detail: initialDetail, token }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState<BriefDetail>(initialDetail);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);

  const lastDoneCountRef = useRef<number>(0);
  const pollAbortRef = useRef<AbortController | null>(null);

  const { brief, subtasks, run } = detail;
  const displayName = brief.client_name || "Untitled design";

  // Poll every 3s while building. Stop when status flips to done/error.
  useEffect(() => {
    if (brief.status !== "building") {
      lastDoneCountRef.current = subtasks.filter((s) => s.status === "done").length;
      return;
    }

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const ctrl = new AbortController();
      pollAbortRef.current = ctrl;
      try {
        const res = await fetch(`/api/design/briefs/${briefId}/detail`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data: BriefDetail = await res.json();
        if (cancelled) return;

        setDetail(data);

        // If subtask done-count increased, trigger a FileTree refetch
        // so newly completed COMPOSER sections appear as files.
        const newDoneCount = data.subtasks.filter((s) => s.status === "done").length;
        if (newDoneCount > lastDoneCountRef.current) {
          lastDoneCountRef.current = newDoneCount;
          setFilesRefreshKey((k) => k + 1);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("poll error", err);
      }
    };

    // Fire immediately, then every 3s
    tick();
    const interval = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      pollAbortRef.current?.abort();
    };
  }, [briefId, brief.status]); // eslint-disable-line react-hooks/exhaustive-deps

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

        <StatusBadge status={brief.status} progress={progress} />

        <div style={{ flex: 1 }} />

        {brief.current_iteration && brief.current_iteration > 1 && (
          <span style={{ fontSize: 12, color: "var(--design-ink3)" }}>
            v{brief.current_iteration}
          </span>
        )}

        {brief.status !== "building" && (
          <button
            onClick={() => setShareOpen(true)}
            style={{
              background: "var(--design-terracotta)",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>↗</span>
            Share preview
          </button>
        )}
      </header>

      {brief.status === "building" && (
        <div style={{ height: 2, background: "var(--design-border)", flexShrink: 0 }}>
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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
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

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
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
            <FileTree
              briefId={briefId}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              onFilesLoaded={setFiles}
              refreshKey={filesRefreshKey}
            />
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <CodeViewer
              briefId={briefId}
              files={files}
              selectedFile={selectedFile}
              briefStatus={brief.status}
            />
          </div>
        </div>
      </div>

      <ShareModal briefId={briefId} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}

function StatusBadge({ status, progress }: { status: Brief["status"]; progress: number }) {
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

export type { Brief, Subtask } from "./page";
