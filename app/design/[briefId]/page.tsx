import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateToken } from "@/lib/auth";
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
  status: "building" | "done" | "error" | "preview_ready";
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

type Env = {
  DB: {
    prepare: (sql: string) => {
      bind: (...args: unknown[]) => {
        first: <T = unknown>() => Promise<T | null>;
        all: <T = unknown>() => Promise<{ results: T[] }>;
      };
    };
  };
};

async function fetchBriefDetail(
  briefId: string,
  userId: string
): Promise<BriefDetail | null> {
  try {
    const env = getCloudflareContext().env as unknown as Env;

    const brief = await env.DB
      .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
      .bind(briefId, userId)
      .first<Brief>();

    if (!brief) return null;

    // Normalize status — preview_ready maps to done for UI display
    if ((brief.status as string) === "preview_ready") {
      brief.status = "done";
    }

    // Fetch subtasks if pipeline ran
    let subtasks: Subtask[] = [];
    let run = null;

    if (brief.orchestrator_run_id) {
      const subtaskRows = await env.DB
        .prepare(
          `SELECT id, agent, status, short_id, output, cost_usd
           FROM agent_subtasks
           WHERE pipeline_run_id = ?
           ORDER BY short_id ASC`
        )
        .bind(brief.orchestrator_run_id)
        .all<Subtask>();
      subtasks = subtaskRows.results ?? [];

      const runRow = await env.DB
        .prepare(`SELECT * FROM orchestrator_runs WHERE id = ?`)
        .bind(brief.orchestrator_run_id)
        .first<{ id: string; status: string; subtasks_total: number; subtasks_done: number }>();
      run = runRow ?? null;
    }

    return { brief, subtasks, run };
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

  // Validate session
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value ?? "";
  const auth = token ? await validateToken(token) : null;

  if (!auth) {
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
        <div style={{ fontSize: 18, fontWeight: 600 }}>Session expired</div>
        <a
          href="https://ll-cockpit.connorpattern.workers.dev/api/design/launch"
          style={{ fontSize: 14, color: "var(--design-terracotta)", textDecoration: "none" }}
        >
          Re-authenticate →
        </a>
      </div>
    );
  }

  const detail = await fetchBriefDetail(briefId, auth.userId);

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
