import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateToken } from "@/lib/auth";
import CanvasClient from "./CanvasClient";

export type Subtask = {
  id: string;
  agent: string;        // mapped from agent_name in D1
  title: string;        // human-readable e.g. "Compose Hero section"
  status: string;
  short_id: string;     // D1 stores as TEXT like 'st_1'
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

type BriefRaw = Omit<Brief, "status"> & { status: string };

type SubtaskRaw = {
  id: string;
  agent_name: string;
  title: string;
  status: string;
  short_id: string;
  output: string | null;
  cost_usd: number | null;
};

async function fetchBriefDetail(
  briefId: string,
  userId: string
): Promise<BriefDetail | null> {
  const env = getCloudflareContext().env as unknown as Env;

  let raw: BriefRaw | null;
  try {
    raw = await env.DB
      .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
      .bind(briefId, userId)
      .first<BriefRaw>();
  } catch (err) {
    console.error("fetchBriefDetail: design_briefs query failed", err);
    return null;
  }

  if (!raw) return null;

  const brief: Brief = {
    ...raw,
    status:
      raw.status === "building" ? "building"
      : raw.status === "error" ? "error"
      : "done",
  };

  let subtasks: Subtask[] = [];
  let run: BriefDetail["run"] = null;

  if (brief.orchestrator_run_id) {
    try {
      const subtaskRows = await env.DB
        .prepare(
          `SELECT id, agent_name, title, status, short_id, output, cost_usd
           FROM agent_subtasks
           WHERE pipeline_run_id = ?
           ORDER BY short_id ASC`
        )
        .bind(brief.orchestrator_run_id)
        .all<SubtaskRaw>();

      subtasks = (subtaskRows.results ?? []).map((r) => ({
        id: r.id,
        agent: r.agent_name,
        title: r.title,
        status: r.status,
        short_id: r.short_id,
        output: r.output ?? undefined,
        cost_usd: r.cost_usd ?? undefined,
      }));
    } catch (err) {
      console.error("fetchBriefDetail: agent_subtasks query failed", err);
    }

    try {
      run = await env.DB
        .prepare(`SELECT id, status, subtasks_total, subtasks_done FROM orchestrator_runs WHERE id = ?`)
        .bind(brief.orchestrator_run_id)
        .first<{ id: string; status: string; subtasks_total: number; subtasks_done: number }>();
    } catch (err) {
      console.error("fetchBriefDetail: orchestrator_runs query failed", err);
    }
  }

  return { brief, subtasks, run };
}

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ briefId: string }>;
}) {
  const { briefId } = await params;

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
