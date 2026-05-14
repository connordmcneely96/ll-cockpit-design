/**
 * GET /api/design/briefs/[id]/detail
 *
 * Returns the full BriefDetail shape the canvas needs — brief row, subtasks,
 * run summary. Same query the server-side page.tsx does, but exposed as JSON
 * so CanvasClient can poll while status === "building".
 */
import { cookies } from "next/headers";
import { validateToken } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

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

type BriefRaw = {
  id: string;
  client_name?: string;
  business_description?: string;
  target_audience?: string;
  mood_tone?: string;
  must_have_sections?: string;
  status: string;
  current_iteration?: number;
  orchestrator_run_id?: string;
  created_at: number;
  updated_at: number;
};

type SubtaskRaw = {
  id: string;
  agent_name: string;
  title: string;
  status: string;
  short_id: string;
  output: string | null;
  cost_usd: number | null;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;

  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) {
    return Response.json({ error: "no_session" }, { status: 401 });
  }
  const auth = await validateToken(token);
  if (!auth) {
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }

  try {
    const env = getCloudflareContext().env as unknown as Env;

    const raw = await env.DB
      .prepare(`SELECT * FROM design_briefs WHERE id = ? AND user_id = ?`)
      .bind(briefId, auth.userId)
      .first<BriefRaw>();

    if (!raw) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const brief = {
      ...raw,
      status:
        raw.status === "building" ? "building"
        : raw.status === "error" ? "error"
        : "done",
    };

    let subtasks: Array<{
      id: string;
      agent: string;
      title: string;
      status: string;
      short_id: string;
      output?: string;
      cost_usd?: number;
    }> = [];
    let run: {
      id: string;
      status: string;
      subtasks_total: number;
      subtasks_done: number;
    } | null = null;

    if (brief.orchestrator_run_id) {
      try {
        const rows = await env.DB
          .prepare(
            `SELECT id, agent_name, title, status, short_id, output, cost_usd
             FROM agent_subtasks
             WHERE pipeline_run_id = ?
             ORDER BY short_id ASC`
          )
          .bind(brief.orchestrator_run_id)
          .all<SubtaskRaw>();

        subtasks = (rows.results ?? []).map((r) => ({
          id: r.id,
          agent: r.agent_name,
          title: r.title,
          status: r.status,
          short_id: r.short_id,
          output: r.output ?? undefined,
          cost_usd: r.cost_usd ?? undefined,
        }));
      } catch (err) {
        console.error("detail subtasks query failed", err);
      }

      try {
        run = await env.DB
          .prepare(
            `SELECT id, status, subtasks_total, subtasks_done
             FROM orchestrator_runs WHERE id = ?`
          )
          .bind(brief.orchestrator_run_id)
          .first<{
            id: string;
            status: string;
            subtasks_total: number;
            subtasks_done: number;
          }>();
      } catch (err) {
        console.error("detail run query failed", err);
      }
    }

    return Response.json({ brief, subtasks, run });
  } catch (err) {
    console.error("detail route error", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "db_error" },
      { status: 500 }
    );
  }
}
