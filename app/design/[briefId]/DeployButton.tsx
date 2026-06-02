"use client";

import { useEffect, useState } from "react";

type BadgeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "deploying" }
  | { status: "live"; url: string }
  | { status: "error"; message: string };

export default function DeployButton({ briefId }: { briefId: string }) {
  const [state, setState] = useState<BadgeState>({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/design/briefs/${briefId}/deploy`)
      .then((r) => r.json())
      .then((data: { deployed?: boolean; live_url?: string }) => {
        if (data.deployed && data.live_url) {
          setState({ status: "live", url: data.live_url });
        } else {
          setState({ status: "idle" });
        }
      })
      .catch(() => setState({ status: "idle" }));
  }, [briefId]);

  async function handleDeploy() {
    setState({ status: "deploying" });
    try {
      const res = await fetch(`/api/design/briefs/${briefId}/deploy`, { method: "POST" });
      if (res.ok) {
        const data: { live_url?: string } = await res.json();
        setState({ status: "live", url: data.live_url ?? "" });
      } else if (res.status === 503) {
        setState({ status: "error", message: "Deploy not configured — set Cloudflare secrets" });
      } else if (res.status === 422) {
        setState({ status: "error", message: "Generate the site before deploying." });
      } else {
        setState({ status: "error", message: "Deploy failed, try again." });
      }
    } catch {
      setState({ status: "error", message: "Deploy failed, try again." });
    }
  }

  function copyUrl(url: string) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  const btnBase = {
    border: "none",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  if (state.status === "loading") return null;

  if (state.status === "idle" || state.status === "error") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={handleDeploy}
          style={{
            ...btnBase,
            background: "var(--design-ink)",
            color: "var(--design-paper)",
          }}
        >
          <span style={{ fontSize: 13, lineHeight: 1 }}>⬡</span>
          Deploy
        </button>
        {state.status === "error" && (
          <span style={{ fontSize: 11, color: "var(--design-ink3)", maxWidth: 180 }}>
            {state.message}
          </span>
        )}
      </div>
    );
  }

  if (state.status === "deploying") {
    return (
      <button
        disabled
        style={{
          ...btnBase,
          background: "var(--design-ink)",
          color: "var(--design-paper)",
          opacity: 0.6,
          cursor: "default",
        }}
      >
        Deploying…
      </button>
    );
  }

  // live
  const { url } = state;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        background: "var(--design-terracotta-soft)",
        border: "1px solid var(--design-terracotta)",
        borderRadius: 6,
        padding: "3px 8px",
        fontSize: 11,
        color: "var(--design-terracotta)",
        fontWeight: 500,
        maxWidth: 260,
      }}
    >
      <span style={{ fontSize: 10 }}>●</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--design-terracotta)",
          textDecoration: "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 120,
        }}
      >
        {url.replace(/^https?:\/\//, "")}
      </a>
      <button
        onClick={() => copyUrl(url)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 10,
          color: copied ? "var(--design-terracotta)" : "var(--design-ink3)",
          padding: "0 2px",
          fontWeight: 500,
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "var(--design-ink3)",
          fontSize: 11,
          textDecoration: "none",
        }}
      >
        ↗
      </a>
      <button
        onClick={handleDeploy}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 10,
          color: "var(--design-ink3)",
          padding: "0 2px",
        }}
      >
        Redeploy
      </button>
    </div>
  );
}
