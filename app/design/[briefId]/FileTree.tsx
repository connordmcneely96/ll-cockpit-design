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

export default function FileTree({ briefId, selectedFile, onSelectFile, onFilesLoaded }: Props) {
  const [files, setFiles] = useState<DesignFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/design/briefs/${briefId}/files`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.files) ? data.files : [];
        setFiles(list);
        onFilesLoaded(list);
        setLoading(false);
        // Auto-select first file if nothing selected yet
        if (list.length > 0 && !selectedFile) {
          onSelectFile(list[0].path);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "fetch_failed");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [briefId]);  // eslint-disable-line react-hooks/exhaustive-deps

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
        }}
      >
        Files
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
            No files yet. Pipeline output will populate here once the build completes.
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
