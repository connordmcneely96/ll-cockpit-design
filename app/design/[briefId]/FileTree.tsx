"use client";

type Props = {
  selectedFile: string | null;
  onSelectFile: (file: string) => void;
};

type TreeFile = {
  name: string;
  path: string;
};

type TreeSection = {
  label: string;
  icon: string;
  files: TreeFile[];
};

// Static shell — 18C wires real files from design_brief_files D1 table
const TREE: TreeSection[] = [
  {
    label: "PAGES",
    icon: "⬜",
    files: [
      { name: "index.html", path: "pages/index.html" },
    ],
  },
  {
    label: "COMPONENTS",
    icon: "⬡",
    files: [
      { name: "app.jsx", path: "components/app.jsx" },
    ],
  },
  {
    label: "STYLESHEETS",
    icon: "◈",
    files: [
      { name: "styles.css", path: "stylesheets/styles.css" },
    ],
  },
];

export default function FileTree({ selectedFile, onSelectFile }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--design-bg)",
      }}
    >
      {/* Header */}
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

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {TREE.map((section) => (
          <div key={section.label}>
            {/* Section header */}
            <div
              style={{
                padding: "6px 12px 3px",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--design-ink3)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{section.icon}</span>
              {section.label}
            </div>

            {/* Files */}
            {section.files.map((file) => {
              const isSelected = selectedFile === file.path;
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
                  {file.name}
                </button>
              );
            })}
          </div>
        ))}

        {/* Empty state note */}
        <div
          style={{
            padding: "16px 12px",
            fontSize: 11,
            color: "var(--design-ink3)",
            lineHeight: 1.6,
            borderTop: "1px solid var(--design-border)",
            marginTop: 8,
          }}
        >
          Files populate as your design builds. Live wiring in Sprint 18C.
        </div>
      </div>
    </div>
  );
}
