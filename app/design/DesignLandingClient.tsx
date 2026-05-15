"use client";

import { useEffect, useState, useRef } from "react";
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

type DesignSystem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  primary_color: string | null;
  tags: string[];
  source_url: string | null;
};

function daysAgo(dateVal: string | number): string {
  const ms = typeof dateVal === "number" ? dateVal * 1000 : new Date(dateVal).getTime();
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/**
 * Sprint 18E — shared hook for design systems fetch with seeding poll.
 * Polls every 3s while server reports seeding:true, stops when populated
 * or after MAX_POLLS (safeguard against runaway).
 */
function useDesignSystems() {
  const [systems, setSystems] = useState<DesignSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const pollCountRef = useRef(0);
  const MAX_POLLS = 30; // 30 × 3s = 90s safety cap

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function fetchOnce() {
      try {
        const r = await fetch("/api/design/systems");
        const data = await r.json();
        if (cancelled) return;
        const list = Array.isArray(data.systems) ? data.systems : [];
        setSystems(list);
        const isSeeding = !!data.seeding && list.length === 0;
        setSeeding(isSeeding);
        setLoading(false);

        if (isSeeding && pollCountRef.current < MAX_POLLS) {
          pollCountRef.current++;
          timer = setTimeout(fetchOnce, 3000);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOnce();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { systems, loading, seeding };
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

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
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

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            background: "var(--design-paper)",
            display: "flex",
            flexDirection: "column",
          }}
        >
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

          <div style={{ padding: 24, flex: 1 }}>
            {rightTab === "Designs" && (
              <DesignsTab
                briefs={briefs}
                loading={loading}
                subTab={designsSubTab}
                setSubTab={setDesignsSubTab}
              />
            )}
            {rightTab === "Examples" && <ExamplesTab router={router} />}
            {rightTab === "Design systems" && <DesignSystemsTab router={router} />}
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
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

        {!loading && briefs.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--design-ink3)", paddingTop: 8 }}>
            No designs yet. Click + Create to start your first project.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sprint 18E — Examples tab. Uses shared useDesignSystems hook which
 * polls while the library is auto-seeding.
 */
function ExamplesTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const { systems, loading, seeding } = useDesignSystems();
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = Array.from(new Set(systems.map((s) => s.category).filter(Boolean))) as string[];
  const filtered = activeCategory === "all"
    ? systems
    : systems.filter((s) => s.category === activeCategory);

  // Initial load
  if (loading) {
    return (
      <div style={{ fontSize: 13, color: "var(--design-ink3)", padding: 16 }}>
        Loading design systems…
      </div>
    );
  }

  // Background seed in progress
  if (seeding && systems.length === 0) {
    return (
      <div style={{ padding: 16, maxWidth: 500 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--design-ink)", marginBottom: 8 }}>
          Building your library…
        </div>
        <div style={{ fontSize: 13, color: "var(--design-ink3)", marginBottom: 16, lineHeight: 1.5 }}>
          This is a one-time setup. We&apos;re importing ~70 brand-inspired design systems from
          our curated source. Should take 30-60 seconds.
        </div>
        <div
          style={{
            height: 4,
            background: "var(--design-bg2)",
            borderRadius: 2,
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: "40%",
              background: "var(--design-terracotta)",
              animation: "slide 1.5s ease-in-out infinite",
            }}
          />
        </div>
        <style jsx>{`
          @keyframes slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(250%); }
          }
        `}</style>
      </div>
    );
  }

  if (systems.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "var(--design-ink3)", padding: 16 }}>
        Library is empty. Try refreshing the page — the first load triggers the import.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--design-ink)", marginBottom: 4 }}>
          Build with a design system
        </div>
        <div style={{ fontSize: 13, color: "var(--design-ink3)" }}>
          {systems.length} curated brand-inspired systems. Click any to start a brief with that aesthetic locked in.
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
        <button
          onClick={() => setActiveCategory("all")}
          style={{
            background: activeCategory === "all" ? "var(--design-ink)" : "transparent",
            color: activeCategory === "all" ? "white" : "var(--design-ink)",
            border: activeCategory === "all" ? "none" : "1px solid var(--design-border)",
            borderRadius: 999,
            padding: "5px 12px",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: activeCategory === "all" ? 500 : 400,
          }}
        >
          All
        </button>
        {categories.sort().map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              background: activeCategory === cat ? "var(--design-ink)" : "transparent",
              color: activeCategory === cat ? "white" : "var(--design-ink)",
              border: activeCategory === cat ? "none" : "1px solid var(--design-border)",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: activeCategory === cat ? 500 : 400,
              textTransform: "capitalize",
            }}
          >
            {cat.replace(/-/g, " ")}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {filtered.map((sys) => (
          <button
            key={sys.id}
            onClick={() => router.push(`/design/new?system=${encodeURIComponent(sys.slug)}`)}
            style={{
              border: "1px solid var(--design-border)",
              borderRadius: 8,
              padding: 0,
              textAlign: "left",
              background: "var(--design-paper)",
              cursor: "pointer",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                height: 80,
                background: sys.primary_color || "var(--design-bg2)",
                display: "grid",
                placeItems: "center",
                color: "white",
                fontSize: 11,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                opacity: 0.95,
              }}
            >
              {sys.primary_color || ""}
            </div>
            <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--design-ink)" }}>
                {sys.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--design-ink3)",
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {sys.description || ""}
              </div>
              {sys.tags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                  {sys.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        background: "var(--design-bg2)",
                        color: "var(--design-ink2)",
                        borderRadius: 4,
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DesignSystemsTab({ router }: { router: ReturnType<typeof useRouter> }) {
  const { systems, loading, seeding } = useDesignSystems();

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
            Teach Claude your brand and product (coming soon)
          </div>
        </div>
        <button
          disabled
          style={{
            border: "1px solid var(--design-border)",
            borderRadius: 6,
            padding: "8px 14px",
            fontSize: 13,
            background: "transparent",
            cursor: "not-allowed",
            color: "var(--design-ink3)",
            opacity: 0.6,
          }}
        >
          Create
        </button>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--design-ink)", marginBottom: 12 }}>
        Curated library ({systems.length})
        {seeding && systems.length === 0 && (
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--design-terracotta)", marginLeft: 8 }}>
            — importing now, hang tight
          </span>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 13, color: "var(--design-ink3)" }}>Loading…</div>
      )}

      {!loading && seeding && systems.length === 0 && (
        <div
          style={{
            border: "1px solid var(--design-border)",
            borderRadius: 6,
            padding: 20,
            color: "var(--design-ink3)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          One-time import in progress — pulling ~70 brand-inspired design systems
          from our curated source. Updates automatically when ready (~30-60s).
        </div>
      )}

      {!loading && !seeding && systems.length === 0 && (
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
          Library empty. Refresh to trigger import.
        </div>
      )}

      {!loading && systems.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
          {systems.map((sys) => (
            <button
              key={sys.id}
              onClick={() => router.push(`/design/new?system=${encodeURIComponent(sys.slug)}`)}
              style={{
                border: "1px solid var(--design-border)",
                borderRadius: 6,
                padding: "10px 12px",
                background: "var(--design-paper)",
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  background: sys.primary_color || "var(--design-bg2)",
                  flexShrink: 0,
                  border: "1px solid var(--design-border)",
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--design-ink)" }}>
                  {sys.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--design-ink3)",
                    textTransform: "capitalize",
                  }}
                >
                  {sys.category?.replace(/-/g, " ") || "other"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--design-ink3)", marginTop: 12 }}>
        Library is shared across all users. User-created systems (coming soon) are private to you.
      </div>
    </div>
  );
}
