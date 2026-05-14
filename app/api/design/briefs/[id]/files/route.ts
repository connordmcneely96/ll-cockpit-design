/**
 * GET /api/design/briefs/[id]/files
 *
 * Returns virtual files derived from the brief's latest iteration AND
 * any completed COMPOSER subtasks (mid-stream visibility).
 *
 * Files when iteration is done:
 *   - pages/index.html       (page_html as-is, the assembled output)
 *   - stylesheets/styles.css (extracted <style> from page_html OR design_tokens)
 *   - components/app.jsx     (extracted React if present)
 *   - design-tokens.json     (DESIGNER output, pretty-printed)
 *
 * Files while iteration is building:
 *   - design-tokens.json                    (as soon as DESIGNER done)
 *   - components/{slug}.html                (one per COMPOSER done — show progress)
 *   - pages/index.html                      (as soon as ASSEMBLER done)
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

type IterationRow = {
  id: string;
  iteration_number: number;
  design_tokens_json: string | null;
  page_html: string | null;
  preview_url: string | null;
  status: string;
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
  source?: "iteration" | "composer" | "designer";
};

function extractStyleTag(html: string): string {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1].trim() : "";
}

function extractReactComponent(html: string): string {
  const match = html.match(/<script[^>]*type=["']text\/jsx["'][^>]*>([\s\S]*?)<\/script>/i);
  return match ? match[1].trim() : "";
}

function slugifyTitle(title: string): string {
  // "Compose Hero section" → "hero"
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
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;

  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return Response.json({ files: [], error: "no_session" }, { status: 401 });

  const auth = await validateToken(token);
  if (!auth) return Response.json({ files: [], error: "invalid_token" }, { status: 401 });

  try {
    const env = getCloudflareContext().env as unknown as Env;

    const iteration = await env.DB
      .prepare(
        `SELECT i.id, i.iteration_number, i.design_tokens_json, i.page_html,
                i.preview_url, i.status,
                b.orchestrator_run_id
         FROM design_iterations i
         JOIN design_briefs b ON b.id = i.brief_id
         WHERE i.brief_id = ?
           AND b.user_id = ?
         ORDER BY i.iteration_number DESC
         LIMIT 1`
      )
      .bind(briefId, auth.userId)
      .first<IterationRow & { orchestrator_run_id: string | null }>();

    if (!iteration) {
      return Response.json({ files: [], error: "not_found" }, { status: 404 });
    }

    const files: FileEntry[] = [];

    // Design tokens — available as soon as DESIGNER finishes
    if (iteration.design_tokens_json) {
      let prettyTokens = iteration.design_tokens_json;
      try {
        prettyTokens = JSON.stringify(JSON.parse(iteration.design_tokens_json), null, 2);
      } catch { /* leave as-is */ }
      files.push({
        path: "design-tokens.json",
        type: "json",
        content: prettyTokens,
        source: "designer",
      });
    }

    // Composer sections (mid-stream visibility)
    // Even before the iteration is assembled, each completed COMPOSER subtask
    // contributes a virtual component file.
    if (iteration.orchestrator_run_id) {
      const subtasks = await env.DB
        .prepare(
          `SELECT id, agent_name, title, status, output
           FROM agent_subtasks
           WHERE pipeline_run_id = ?
             AND agent_name = 'composer'
             AND status = 'done'
             AND output IS NOT NULL
           ORDER BY short_id ASC`
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
          source: "composer",
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
        source: "iteration",
      });

      if (styles) {
        files.push({
          path: "stylesheets/styles.css",
          type: "css",
          content: styles,
          source: "iteration",
        });
      }
      if (jsx) {
        files.push({
          path: "components/app.jsx",
          type: "jsx",
          content: jsx,
          source: "iteration",
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
    });
  } catch (err) {
    console.error("files route error", err);
    return Response.json(
      { files: [], error: err instanceof Error ? err.message : "db_error" },
      { status: 500 }
    );
  }
}
