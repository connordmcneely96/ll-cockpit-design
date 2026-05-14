"use client";

import { useEffect, useState } from "react";

type Props = {
  briefId: string;
  open: boolean;
  onClose: () => void;
};

type ShareToken = {
  token: string;
  brief_id: string;
  iteration_number: number | null;
  created_by_user_id: string;
  created_at: number;
  expires_at: number | null;
  view_count: number;
  last_viewed_at: number | null;
};

const EXPIRY_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
  { label: "Never", hours: 0 },
];

function formatRelative(unixSec: number | null): string {
  if (!unixSec) return "—";
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

function formatExpiry(unixSec: number | null): string {
  if (!unixSec) return "Never expires";
  const diff = unixSec - Date.now() / 1000;
  if (diff < 0) return "Expired";
  if (diff < 86400) return `Expires in ${Math.floor(diff / 3600)} hr`;
  return `Expires in ${Math.floor(diff / 86400)} days`;
}

export default function ShareModal({ briefId, open, onClose }: Props) {
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedExpiry, setSelectedExpiry] = useState(24 * 7); // default 7d
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadTokens = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/design/briefs/${briefId}/share`);
      const data = await r.json();
      setTokens(Array.isArray(data?.tokens) ? data.tokens : []);
    } catch {
      setTokens([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadTokens();
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    setCreating(true);
    try {
      const r = await fetch(`/api/design/briefs/${briefId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expires_in_hours: selectedExpiry }),
      });
      const data = await r.json();
      if (data?.url) {
        try { await navigator.clipboard.writeText(data.url); } catch {}
        setCopiedToken(data.token);
      }
      await loadTokens();
    } catch {
      // swallow
    }
    setCreating(false);
  };

  const handleRevoke = async (token: string) => {
    try {
      await fetch(`/api/design/briefs/${briefId}/share?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      await loadTokens();
    } catch {
      // swallow
    }
  };

  const handleCopy = async (token: string) => {
    const url = `https://design.connorpattern.workers.dev/design/preview/${briefId}?t=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      // clipboard blocked — surface the URL inline so user can copy manually
      window.prompt("Copy this URL:", url);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14,17,22,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--design-paper)",
          borderRadius: 12,
          width: 520,
          maxWidth: "92vw",
          maxHeight: "85vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--design-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--design-ink)" }}>Share preview</div>
            <div style={{ fontSize: 12, color: "var(--design-ink3)", marginTop: 2 }}>
              Anyone with the link can view this design (no login required).
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, color: "var(--design-ink3)", cursor: "pointer", padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Create */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--design-border)" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--design-ink2)", marginBottom: 8 }}>
            Link expires
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {EXPIRY_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                onClick={() => setSelectedExpiry(opt.hours)}
                style={{
                  border: `1px solid ${selectedExpiry === opt.hours ? "var(--design-terracotta)" : "var(--design-border)"}`,
                  background: selectedExpiry === opt.hours ? "var(--design-terracotta-soft)" : "transparent",
                  color: selectedExpiry === opt.hours ? "var(--design-terracotta)" : "var(--design-ink2)",
                  borderRadius: 999,
                  padding: "5px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: selectedExpiry === opt.hours ? 500 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              width: "100%",
              background: "var(--design-terracotta)",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: creating ? "not-allowed" : "pointer",
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? "Creating…" : "+ Create share link"}
          </button>
        </div>

        {/* Existing tokens */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--design-ink2)", marginBottom: 10 }}>
            Active links
          </div>

          {loading && <div style={{ fontSize: 12, color: "var(--design-ink3)" }}>Loading…</div>}

          {!loading && tokens.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--design-ink3)" }}>
              No active share links. Create one above.
            </div>
          )}

          {!loading && tokens.map((t) => (
            <div
              key={t.token}
              style={{
                border: "1px solid var(--design-border)",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 8,
                background: "var(--design-bg)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <code
                  style={{
                    flex: 1,
                    fontSize: 11,
                    color: "var(--design-ink2)",
                    fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  …{t.token.slice(-12)}
                </code>
                <button
                  onClick={() => handleCopy(t.token)}
                  style={{
                    fontSize: 11,
                    padding: "3px 9px",
                    border: "1px solid var(--design-border)",
                    background: copiedToken === t.token ? "var(--design-terracotta-soft)" : "transparent",
                    color: copiedToken === t.token ? "var(--design-terracotta)" : "var(--design-ink2)",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {copiedToken === t.token ? "Copied" : "Copy link"}
                </button>
                <button
                  onClick={() => handleRevoke(t.token)}
                  style={{
                    fontSize: 11,
                    padding: "3px 9px",
                    border: "1px solid var(--design-border)",
                    background: "transparent",
                    color: "#991b1b",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  Revoke
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--design-ink3)", display: "flex", gap: 12 }}>
                <span>{formatExpiry(t.expires_at)}</span>
                <span>{t.view_count} view{t.view_count === 1 ? "" : "s"}</span>
                {t.last_viewed_at && <span>Last opened {formatRelative(t.last_viewed_at)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
