"use client";

import { useEffect, useState } from "react";

export type DesignFile = {
  path: string;
  type: "html" | "css" | "jsx" | "json";
  content: string;
};

type Props = {
  briefId: string;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onFilesLoaded: (files: DesignFile[]) => void;
  refreshKey?: number; // Bump from parent to trigger a refetch
};

type Section = {
  label: string;
  prefix: string;
};

const SECTIONS: Section[] = [
  { label: "PAGES", prefix: "pages/" },
  { label: "COMPONENTS", prefix: "components/" },
  { label: "STYLESHEETS", prefix: "stylesheets/" },
  { label: "TOKENS", prefix: "design-tokens" },
];

export default function FileTree({
  briefId,
  selectedFile,
  onSelectFile,
  onFilesLoaded,
  refreshKey = 0,
}: Props) {
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Sprint 18K B3 — export state
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // On the very first load, show the skeleton. On polled refetches, do silent
    // updates so the tree doesn't flicker between every 3s tick.
    const isFirstLoad = refreshKey === 0;
    if (isFirstLoad) setLoading(true);

    fetch(`/api/design/briefs/${briefId}/files`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.files) ? data.files : [];
        setFiles(list);
        onFilesLoaded(list);
        setLoading(false);
        if (list.length > 0 && !selectedFile) {
          onSelectFile(list[0].path);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "fetch_failed");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [briefId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sprint 18K B3 — trigger ZIP download via export route
  async function handleExport() {
    if (exporting || files.length === 0) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/design/briefs/${briefId}/export`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`export_failed_${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const nameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = nameMatch?.[1] ?? "project.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("export failed", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--design-bg)" }}>
      <div
        style={{
          padding: "10px 12px 8px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--design-ink3)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          borderBottom: "1px solid var(--design-border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>Files</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {files.length > 0 && (
            <span style={{ fontWeight: 400, color: "var(--design-ink3)", fontSize: 10 }}>
              {files.length}
            </span>
          )}
          {/* Sprint 18K B3 — export button, only shown when files are ready */}
          {files.length > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Download all files as ZIP"
              style={{
                background: "transparent",
                border: "1px solid var(--design-border)",
                borderRadius: 4,
                padding: "2px 7px",
                fontSize: 10,
                color: exporting ? "var(--design-ink3)" : "var(--design-ink2)",
                cursor: exporting ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                lineHeight: 1.4,
                opacity: exporting ? 0.5 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {exporting ? "…" : "⬇ Export"}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--design-ink3)" }}>
            Loading files...
          </div>
        )}

        {error && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "#991b1b" }}>
            {error}
          </div>
        )}

        {!loading && !error && files.length === 0 && (
          <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--design-ink3)", lineHeight: 1.6 }}>
            No files yet. Files appear here as each section completes.
          </div>
        )}

        {!loading && !error && SECTIONS.map((section) => {
          const sectionFiles = files.filter((f) =>
            section.prefix.endsWith("/")
              ? f.path.startsWith(section.prefix)
              : f.path.startsWith(section.prefix)
          );
          if (sectionFiles.length === 0) return null;

          return (
            <div key={section.label}>
              <div
                style={{
                  padding: "8px 12px 3px",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--design-ink3)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {section.label}
              </div>
              {sectionFiles.map((file) => {
                const isSelected = selectedFile === file.path;
                const filename = file.path.split("/").pop() ?? file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => onSelectFile(file.path)}
                    style={{
                      width: "100%",
                      background: isSelected ? "var(--design-terracotta-soft)" : "transparent",
                      border: "none",
                      borderLeft: isSelected
                        ? "2px solid var(--design-terracotta)"
                        : "2px solid transparent",
                      padding: "5px 12px 5px 20px",
                      textAlign: "left",
                      fontSize: 12,
                      color: isSelected ? "var(--design-terracotta)" : "var(--design-ink2)",
                      cursor: "pointer",
                      fontWeight: isSelected ? 500 : 400,
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {filename}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
