/**
 * GET /api/design/briefs/[id]/files
 *
 * Sprint 18K Phase B (B1) — reads real project files from R2 via the
 * design_brief_files table written by hub's writeProjectFilesToR2 after
 * ASSEMBLER completes. Falls back to virtual extraction from design_iterations
 * for pre-18K briefs that have no design_brief_files rows.
 *
 * Real files (post-18K, source = 'r2'):
 *   - design-tokens.json        (DESIGNER output)
 *   - pages/index.html          (assembled page)
 *   - stylesheets/styles.css    (extracted <style>)
 *   - components/{slug}.html    (one per COMPOSER section)
 *   - components/app.jsx        (if present)
 *
 * Virtual files (pre-18K fallback, source = 'virtual'):
 *   - pages/index.html          (page_html as-is)
 *   - stylesheets/styles.css    (extracted <style> from page_html)
 *   - components/app.jsx        (extracted React if present)
 *   - design-tokens.json        (DESIGNER output, pretty-printed)
 *   - components/{slug}.html    (one per completed COMPOSER subtask)
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
  R2: {
    get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
  };
};

type IterationRow = {
  id: string;
  iteration_number: number;
  design_tokens_json: string | null;
  page_html: string | null;
  preview_url: string | null;
  status: string;
};

type BriefFileRow = {
  file_path: string;
  r2_key: string;
  file_type: "html" | "css" | "jsx" | "json";
  source: string;
};

type SubtaskRow = {
  id: string;
  agent_name: string;
  title: string;
  status: string;
  output: string | null;
};

type FileEntry = {
  path: string;
  type: "html" | "css" | "jsx" | "json";
  content: string;
  source?: "r2" | "iteration" | "composer" | "designer" | "virtual";
};

// ── virtual-extraction helpers (pre-18K fallback) ────────────────────

function extractStyleTag(html: string): string {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1].trim() : "";
}

function extractReactComponent(html: string): string {
  const match = html.match(
    /<script[^>]*type=["']text\/jsx["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  return match ? match[1].trim() : "";
}

function slugifyTitle(title: string): string {
  return title
    .replace(/^Compose\s+/i, "")
    .replace(/\s+section\s*$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "section";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: briefId } = await ctx.params;

  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token)
    return Response.json({ files: [], error: "no_session" }, { status: 401 });

  const auth = await validateToken(token);
  if (!auth)
    return Response.json(
      { files: [], error: "invalid_token" },
      { status: 401 },
    );

  try {
    const env = getCloudflareContext().env as unknown as Env;

    // Fetch latest iteration (ownership check via JOIN on user_id)
    const iteration = await env.DB
      .prepare(
        `SELECT i.id, i.iteration_number, i.design_tokens_json, i.page_html,
                i.preview_url, i.status, b.orchestrator_run_id
         FROM design_iterations i
         JOIN design_briefs b ON b.id = i.brief_id
         WHERE i.brief_id = ? AND b.user_id = ?
         ORDER BY i.iteration_number DESC
         LIMIT 1`,
      )
      .bind(briefId, auth.userId)
      .first<IterationRow & { orchestrator_run_id: string | null }>();

    if (!iteration) {
      return Response.json({ files: [], error: "not_found" }, { status: 404 });
    }

    // ── Sprint 18K Phase B: check design_brief_files for real R2 files ──
    const realFilesResult = await env.DB
      .prepare(
        `SELECT file_path, r2_key, file_type, source
         FROM design_brief_files
         WHERE brief_id = ? AND iteration_id = ?
         ORDER BY source ASC, file_path ASC`,
      )
      .bind(briefId, iteration.id)
      .all<BriefFileRow>();

    const realFileRows = realFilesResult.results ?? [];

    if (realFileRows.length > 0) {
      // Real files exist — read each from R2
      const files: FileEntry[] = [];
      for (const row of realFileRows) {
        try {
          const obj = await env.R2.get(row.r2_key);
          if (!obj) continue;
          const content = await obj.text();
          files.push({
            path: row.file_path,
            type: row.file_type,
            content,
            source: "r2",
          });
        } catch (err) {
          // Skip unreadable file rather than failing the whole response
          console.error(`R2 read failed for ${row.r2_key}`, err);
        }
      }
      return Response.json({
        files,
        iteration: {
          id: iteration.id,
          iteration_number: iteration.iteration_number,
          status: iteration.status,
        },
        source: "r2",
      });
    }

    // ── Fallback: virtual extraction for pre-18K briefs ──────────────
    // No design_brief_files rows means this brief was built before Sprint 18K.
    // Extract files inline from the stored design_iterations columns.
    const files: FileEntry[] = [];

    // Design tokens — available as soon as DESIGNER finishes
    if (iteration.design_tokens_json) {
      let prettyTokens = iteration.design_tokens_json;
      try {
        prettyTokens = JSON.stringify(
          JSON.parse(iteration.design_tokens_json),
          null,
          2,
        );
      } catch {
        /* leave as-is */
      }
      files.push({
        path: "design-tokens.json",
        type: "json",
        content: prettyTokens,
        source: "virtual",
      });
    }

    // Composer sections (mid-stream visibility for pre-18K builds)
    if (iteration.orchestrator_run_id) {
      const subtasks = await env.DB
        .prepare(
          `SELECT id, agent_name, title, status, output
           FROM agent_subtasks
           WHERE pipeline_run_id = ?
             AND agent_name = 'composer'
             AND status = 'done'
             AND output IS NOT NULL
           ORDER BY short_id ASC`,
        )
        .bind(iteration.orchestrator_run_id)
        .all<SubtaskRow>();

      for (const t of subtasks.results ?? []) {
        if (!t.output) continue;
        const slug = slugifyTitle(t.title);
        files.push({
          path: `components/${slug}.html`,
          type: "html",
          content: t.output,
          source: "virtual",
        });
      }
    }

    // Final assembled output — available when ASSEMBLER finishes
    if (iteration.page_html) {
      const styles = extractStyleTag(iteration.page_html);
      const jsx = extractReactComponent(iteration.page_html);

      files.push({
        path: "pages/index.html",
        type: "html",
        content: iteration.page_html,
        source: "virtual",
      });

      if (styles) {
        files.push({
          path: "stylesheets/styles.css",
          type: "css",
          content: styles,
          source: "virtual",
        });
      }
      if (jsx) {
        files.push({
          path: "components/app.jsx",
          type: "jsx",
          content: jsx,
          source: "virtual",
        });
      }
    }

    return Response.json({
      files,
      iteration: {
        id: iteration.id,
        iteration_number: iteration.iteration_number,
        status: iteration.status,
      },
      source: "virtual",
    });
  } catch (err) {
    console.error("files route error", err);
    return Response.json(
      { files: [], error: err instanceof Error ? err.message : "db_error" },
      { status: 500 },
    );
  }
}
