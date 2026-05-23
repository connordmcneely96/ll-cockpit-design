"use client";

import { useState, useEffect } from "react";

export type PageTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  sections_json: string[];
};

type Props = {
  onSelect: (template: PageTemplate) => void;
  onSkip: () => void;
};

export default function TemplatePicker({ onSelect, onSkip }: Props) {
  const [templates, setTemplates] = useState<PageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  async function fetchTemplates(isRetry = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/design/page-templates");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.seeding && (!data.templates || data.templates.length === 0)) {
        if (!isRetry) {
          setSeeding(true);
          setTimeout(() => {
            setSeeding(false);
            setRetryCount((c) => c + 1);
          }, 2000);
        } else {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      setTemplates(data.templates ?? []);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fetch_failed");
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates(retryCount > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount]);

  const showSpinner = loading || seeding;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--design-bg)",
        color: "var(--design-ink)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "40px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 8,
            color: "var(--design-ink)",
          }}
        >
          Choose a template to get started
        </h1>
        <p style={{ fontSize: 14, color: "var(--design-ink3)", marginBottom: 32 }}>
          Pre-fills your section list. You can still edit everything before submitting.
        </p>

        {showSpinner && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              color: "var(--design-ink3)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 16,
                height: 16,
                border: "2px solid var(--design-border)",
                borderTopColor: "var(--design-terracotta)",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
            Loading templates…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!showSpinner && error && (
          <div style={{ fontSize: 14, color: "#991b1b", marginBottom: 16 }}>
            Failed to load templates: {error}.{" "}
            <button
              onClick={() => fetchTemplates(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--design-terracotta)",
                cursor: "pointer",
                fontSize: 14,
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!showSpinner && !error && templates.length === 0 && (
          <div style={{ fontSize: 14, color: "var(--design-ink3)", marginBottom: 16 }}>
            No templates available.{" "}
            <button
              onClick={() => fetchTemplates(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--design-terracotta)",
                cursor: "pointer",
                fontSize: 14,
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!showSpinner && !error && templates.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 16,
            }}
          >
            <style>{`
              @media (min-width: 640px) { .tpl-grid { grid-template-columns: repeat(3, 1fr) !important; } }
              @media (min-width: 900px) { .tpl-grid { grid-template-columns: repeat(4, 1fr) !important; } }
              .tpl-card:hover { border-color: var(--design-terracotta) !important; background: var(--design-terracotta-soft) !important; }
            `}</style>
            <div
              className="tpl-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 16,
                gridColumn: "1 / -1",
              }}
            >
              {templates.map((t) => {
                const visibleSections = t.sections_json.slice(0, 4);
                const extra = t.sections_json.length - 4;
                return (
                  <button
                    key={t.id}
                    className="tpl-card"
                    onClick={() => onSelect(t)}
                    style={{
                      background: "var(--design-paper)",
                      border: "1px solid var(--design-border)",
                      borderRadius: 10,
                      padding: "18px 16px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "border-color 0.15s ease, background 0.15s ease",
                    }}
                  >
                    {t.category && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--design-ink3)",
                          border: "1px solid var(--design-border)",
                          borderRadius: 999,
                          padding: "2px 7px",
                          marginBottom: 8,
                        }}
                      >
                        {t.category}
                      </span>
                    )}
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--design-ink)",
                        marginBottom: 6,
                      }}
                    >
                      {t.name}
                    </div>
                    {t.description && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--design-ink3)",
                          lineHeight: 1.45,
                          marginBottom: 12,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {t.description}
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {visibleSections.map((s) => (
                        <span
                          key={s}
                          style={{
                            fontSize: 11,
                            color: "var(--design-ink2)",
                            background: "var(--design-bg2)",
                            border: "1px solid var(--design-border)",
                            borderRadius: 4,
                            padding: "2px 6px",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                      {extra > 0 && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--design-ink3)",
                            padding: "2px 4px",
                          }}
                        >
                          +{extra} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <button
            onClick={onSkip}
            style={{
              background: "none",
              border: "none",
              color: "var(--design-ink3)",
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "underline",
              padding: 0,
            }}
          >
            Skip — describe sections manually
          </button>
        </div>
      </div>
    </div>
  );
}
