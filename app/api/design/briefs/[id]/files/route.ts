/**
 * GET /api/design/briefs/[id]/files
 *
 * Owner-only. Returns virtual files derived from the brief's latest iteration:
 *   - pages/index.html       (from design_iterations.page_html)
 *   - stylesheets/styles.css (extracted <style>...</style> from page_html, or empty)
 *   - components/app.jsx     (extracted React if present, else empty)
 *   - design-tokens.json     (from design_iterations.design_tokens_json)
 *
 * No new D1 table — reads what the pipeline already wrote.
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

type FileEntry = {
  path: string;
  type: "html" | "css" | "jsx" | "json";
  content: string;
};

function extractStyleTag(html: string): string {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1].trim() : "";
}

function extractReactComponent(html: string): string {
  // Heuristic: look for a <script type="text/jsx"> or //@react-component marker.
  // Most ASSEMBLER output today is pure HTML, so this typically returns empty.
  const match = html.match(/<script[^>]*type=["']text\/jsx["'][^>]*>([\s\S]*?)<\/script>/i);
  return match ? match[1].trim() : "";
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;

  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) {
    return Response.json({ files: [], error: "no_session" }, { status: 401 });
  }

  const auth = await validateToken(token);
  if (!auth) {
    return Response.json({ files: [], error: "invalid_token" }, { status: 401 });
  }

  try {
    const env = getCloudflareContext().env as unknown as Env;

    // Tenant isolation: user_id check in the JOIN
    const iteration = await env.DB
      .prepare(
        `SELECT i.id, i.iteration_number, i.design_tokens_json, i.page_html,
                i.preview_url, i.status
         FROM design_iterations i
         JOIN design_briefs b ON b.id = i.brief_id
         WHERE i.brief_id = ?
           AND b.user_id = ?
         ORDER BY i.iteration_number DESC
         LIMIT 1`
      )
      .bind(briefId, auth.userId)
      .first<IterationRow>();

    if (!iteration) {
      return Response.json({ files: [], error: "not_found" }, { status: 404 });
    }

    const pageHtml = iteration.page_html ?? "";
    const styles = extractStyleTag(pageHtml);
    const jsx = extractReactComponent(pageHtml);
    const tokens = iteration.design_tokens_json ?? "";

    const files: FileEntry[] = [];

    if (pageHtml) {
      files.push({ path: "pages/index.html", type: "html", content: pageHtml });
    }
    if (styles) {
      files.push({ path: "stylesheets/styles.css", type: "css", content: styles });
    }
    if (jsx) {
      files.push({ path: "components/app.jsx", type: "jsx", content: jsx });
    }
    if (tokens) {
      // Pretty-print if valid JSON, else keep as-is
      let prettyTokens = tokens;
      try {
        prettyTokens = JSON.stringify(JSON.parse(tokens), null, 2);
      } catch {
        // leave as-is
      }
      files.push({ path: "design-tokens.json", type: "json", content: prettyTokens });
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
