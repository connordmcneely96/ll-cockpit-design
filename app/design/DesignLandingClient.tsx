"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LeftPaneClient from "./LeftPaneClient";

const RIGHT_TABS = ["Designs", "Examples", "Design systems"] as const;
type RightTab = (typeof RIGHT_TABS)[number];

type Brief = {
  id: string;
  project_name?: string;
  client_name?: string;
  created_at: string | number;
  status?: string;
};

function daysAgo(dateVal: string | number): string {
  const ms = typeof dateVal === "number" ? dateVal * 1000 : new Date(dateVal).getTime();
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export default function DesignLandingClient() {
  const router = useRouter();
  const [rightTab, setRightTab] = useState<RightTab>("Designs");
  const [designsSubTab, setDesignsSubTab] = useState<"Recent" | "Your designs">("Recent");
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    fetch("/api/design/briefs")
      .then((r) => {
        if (r.status === 401) { setSessionExpired(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setBriefs(Array.isArray(data.briefs) ? data.briefs : []);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Header */}
      <header
        style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderBottom: "1px solid var(--design-border)",
          background: "var(--design-bg)",
          flexShrink: 0,
          gap: 10,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 600, color: "var(--design-ink)" }}>Design Build</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--design-terracotta)",
            border: "1px solid var(--design-terracotta)",
            borderRadius: 999,
            padding: "2px 8px",
          }}
        >
          Beta
        </span>
        <div style={{ flex: 1 }} />
        {sessionExpired && (
          <button
            onClick={() => router.push("https://ll-cockpit.connorpattern.workers.dev/api/design/launch")}
            style={{
              fontSize: 12,
              color: "var(--design-terracotta)",
              background: "var(--design-terracotta-soft)",
              border: "1px solid var(--design-terracotta)",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Session expired — re-authenticate
          </button>
        )}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--design-bg2)",
            border: "1px solid var(--design-border)",
            display: "grid",
            placeItems: "center",
            fontSize: 12,
            color: "var(--design-ink2)",
            fontWeight: 500,
          }}
        >
          ?
        </div>
      </header>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left pane */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            borderRight: "1px solid var(--design-border)",
            background: "var(--design-bg)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <LeftPaneClient />
        </div>

        {/* Right pane */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            background: "var(--design-paper)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Right tab bar */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid var(--design-border)",
              padding: "0 24px",
              flexShrink: 0,
            }}
          >
            {RIGHT_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: rightTab === tab ? "2px solid var(--design-ink)" : "2px solid transparent",
                  padding: "12px 14px",
                  fontSize: 14,
                  fontWeight: rightTab === tab ? 600 : 400,
                  color: rightTab === tab ? "var(--design-ink)" : "var(--design-ink3)",
                  cursor: "pointer",
                  marginBottom: -1,
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Right tab content */}
          <div style={{ padding: 24, flex: 1 }}>
            {rightTab === "Designs" && (
              <DesignsTab
                briefs={briefs}
                loading={loading}
                subTab={designsSubTab}
                setSubTab={setDesignsSubTab}
              />
            )}
            {rightTab === "Examples" && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 200,
                  fontSize: 14,
                  color: "var(--design-ink3)",
                }}
              >
                Examples coming soon
              </div>
            )}
            {rightTab === "Design systems" && <DesignSystemsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

function DesignsTab({
  briefs,
  loading,
  subTab,
  setSubTab,
}: {
  briefs: Brief[];
  loading: boolean;
  subTab: "Recent" | "Your designs";
  setSubTab: (t: "Recent" | "Your designs") => void;
}) {
  return (
    <div>
      {/* Sub-tabs + search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        {(["Recent", "Your designs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            style={{
              background: subTab === t ? "var(--design-ink)" : "transparent",
              color: subTab === t ? "white" : "var(--design-ink)",
              border: subTab === t ? "none" : "1px solid var(--design-border)",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: subTab === t ? 500 : 400,
            }}
          >
            {t}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          type="text"
          placeholder="Search..."
          style={{
            border: "1px solid var(--design-border)",
            borderRadius: 6,
            padding: "8px 12px",
            fontSize: 13,
            width: 200,
            background: "transparent",
            color: "var(--design-ink)",
            outline: "none",
          }}
        />
      </div>

      {/* Card grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {/* Tutorial card */}
        <div
          style={{
            border: "1px solid var(--design-border)",
            borderRadius: 8,
            width: 200,
            overflow: "hidden",
          }}
        >
          <div style={{ background: "#e8f0f8", height: 100, display: "grid", placeItems: "center" }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="var(--design-ink)" strokeWidth="1.5">
              <circle cx="20" cy="10" r="5" />
              <line x1="20" y1="5" x2="20" y2="3" />
              <rect x="8" y="18" width="24" height="16" rx="2" />
              <line x1="13" y1="24" x2="27" y2="24" />
              <line x1="13" y1="28" x2="22" y2="28" />
            </svg>
          </div>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--design-ink)", marginBottom: 4 }}>
              Learn about Design Build
            </div>
            <div style={{ color: "var(--design-terracotta)", fontSize: 13, cursor: "pointer" }}>
              Quick tutorial
            </div>
          </div>
        </div>

        {/* Loading skeletons */}
        {loading && [1, 2, 3].map((n) => (
          <div
            key={n}
            style={{
              border: "1px solid var(--design-border)",
              borderRadius: 8,
              width: 200,
              height: 80,
              background: "var(--design-bg2)",
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        ))}

        {/* Brief cards */}
        {!loading && briefs.map((brief) => (
          <a
            key={brief.id}
            href={`/design/${brief.id}`}
            style={{
              border: "1px solid var(--design-border)",
              borderRadius: 8,
              padding: 0,
              width: 200,
              display: "block",
              color: "var(--design-ink)",
              textDecoration: "none",
              overflow: "hidden",
            }}
          >
            {/* Card preview area */}
            <div
              style={{
                height: 80,
                background: "linear-gradient(135deg, var(--design-terracotta-soft) 0%, var(--design-bg2) 100%)",
                display: "grid",
                placeItems: "center",
                fontSize: 22,
              }}
            >
              🎨
            </div>
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>
                {brief.project_name || brief.client_name || "Untitled"}
              </div>
              <div style={{ color: "var(--design-ink3)", fontSize: 11 }}>
                {daysAgo(brief.created_at)}
              </div>
            </div>
          </a>
        ))}

        {/* Empty state */}
        {!loading && briefs.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--design-ink3)", paddingTop: 8 }}>
            No designs yet. Click + Create to start your first project.
          </div>
        )}
      </div>
    </div>
  );
}

function DesignSystemsTab() {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "var(--design-ink)" }}>
        Design Systems
      </div>
      <div
        style={{
          border: "1px solid var(--design-border)",
          borderRadius: 8,
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ fontWeight: 500, fontSize: 14, color: "var(--design-ink)" }}>
            Create new design system
          </div>
          <div style={{ color: "var(--design-ink3)", fontSize: 13, marginTop: 2 }}>
            Teach Claude your brand and product
          </div>
        </div>
        <button
          style={{
            border: "1px solid var(--design-border)",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 13,
            background: "transparent",
            cursor: "pointer",
            color: "var(--design-ink)",
          }}
        >
          Create
        </button>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--design-ink)", marginBottom: 12 }}>
        Templates
      </div>
      <div
        style={{
          border: "1px solid var(--design-border)",
          borderRadius: 6,
          padding: 24,
          textAlign: "center",
          color: "var(--design-ink3)",
          fontSize: 13,
        }}
      >
        No templates yet. Create one from any project via the Share menu → File type.
      </div>
      <div style={{ fontSize: 12, color: "var(--design-ink3)", marginTop: 12 }}>
        Only you can view these settings.
      </div>
    </div>
  );
}
