import { cookies } from "next/headers";
import { cockpitFetch } from "@/lib/cockpit-api";
import CanvasClient from "./CanvasClient";

export type Subtask = {
  id: string;
  agent: string;
  status: string;
  short_id: number;
  output?: string;
  cost_usd?: number;
};

export type Brief = {
  id: string;
  client_name?: string;
  business_description?: string;
  target_audience?: string;
  mood_tone?: string;
  must_have_sections?: string;
  status: "building" | "done" | "error";
  current_iteration?: number;
  orchestrator_run_id?: string;
  created_at: number;
  updated_at: number;
};

export type BriefDetail = {
  brief: Brief;
  subtasks: Subtask[];
  run?: {
    id: string;
    status: string;
    subtasks_total: number;
    subtasks_done: number;
  } | null;
};

async function fetchBriefDetail(briefId: string, token: string): Promise<BriefDetail | null> {
  try {
    const res = await cockpitFetch(`/api/design/briefs/${briefId}`, token);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ briefId: string }>;
}) {
  const { briefId } = await params;

  // Token lives in the httpOnly cookie set by middleware on the ?token= entry flow
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value ?? "";

  // /design/new is the intake placeholder — 18D wires the full pre-flight form
  if (briefId === "new") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 16,
          background: "var(--design-bg)",
          color: "var(--design-ink)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ fontSize: 32 }}>✦</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Brief intake coming soon</div>
        <div style={{ fontSize: 14, color: "var(--design-ink3)", maxWidth: 320, textAlign: "center" }}>
          Pre-flight questions will appear here in Sprint 18D. For now, open an existing design from the{" "}
          <a href="/design" style={{ color: "var(--design-terracotta)", textDecoration: "none" }}>
            landing page
          </a>.
        </div>
      </div>
    );
  }

  const detail = await fetchBriefDetail(briefId, token);

  if (!detail) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          background: "var(--design-bg)",
          color: "var(--design-ink)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>Brief not found</div>
        <a href="/design" style={{ fontSize: 14, color: "var(--design-terracotta)", textDecoration: "none" }}>
          ← Back to Design Build
        </a>
      </div>
    );
  }

  return <CanvasClient briefId={briefId} detail={detail} token={token} />;
}
