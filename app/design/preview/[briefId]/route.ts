/**
 * GET /design/preview/[briefId]
 *
 * Public-bypassed route. Serves the brief's latest iteration HTML if:
 *   (a) ?t=TOKEN matches an active, non-expired design_share_tokens row, OR
 *   (b) sb-access-token cookie validates AND user owns the brief
 *
 * Otherwise: 404 (don't leak brief existence to non-grantees).
 *
 * On successful token-based view, increments view_count + last_viewed_at.
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
        run: () => Promise<unknown>;
      };
    };
  };
};

type IterationRow = {
  iteration_number: number;
  page_html: string | null;
};

type ShareTokenRow = {
  token: string;
  brief_id: string;
  iteration_number: number | null;
  expires_at: number | null;
  revoked_at: number | null;
};

type BriefOwnerRow = {
  user_id: string;
};

const NOT_FOUND_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Not found</title></head>
<body style="font-family: sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#f5f4f1; color:#0e1116;">
  <div style="text-align:center;">
    <h1 style="font-size:18px; font-weight:600; margin:0 0 8px;">Preview not available</h1>
    <p style="font-size:14px; color:#6b7280;">This link may have expired or been revoked.</p>
  </div>
</body></html>`;

function notFound(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function isOwnerViaCookie(briefId: string, env: Env): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return false;
  const auth = await validateToken(token);
  if (!auth) return false;

  const row = await env.DB
    .prepare(`SELECT user_id FROM design_briefs WHERE id = ?`)
    .bind(briefId)
    .first<BriefOwnerRow>();
  return row?.user_id === auth.userId;
}

async function validateShareToken(
  briefId: string,
  tokenParam: string,
  env: Env
): Promise<ShareTokenRow | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB
    .prepare(
      `SELECT token, brief_id, iteration_number, expires_at, revoked_at
       FROM design_share_tokens
       WHERE token = ? AND brief_id = ?`
    )
    .bind(tokenParam, briefId)
    .first<ShareTokenRow>();

  if (!row) return null;
  if (row.revoked_at !== null) return null;
  if (row.expires_at !== null && row.expires_at < now) return null;
  return row;
}

async function recordView(tokenParam: string, env: Env): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB
    .prepare(
      `UPDATE design_share_tokens
       SET view_count = view_count + 1, last_viewed_at = ?
       WHERE token = ?`
    )
    .bind(now, tokenParam)
    .run();
}

async function fetchIterationHtml(
  briefId: string,
  iterationNumber: number | null,
  env: Env
): Promise<string | null> {
  let row: IterationRow | null;
  if (iterationNumber !== null) {
    row = await env.DB
      .prepare(
        `SELECT iteration_number, page_html
         FROM design_iterations
         WHERE brief_id = ? AND iteration_number = ?`
      )
      .bind(briefId, iterationNumber)
      .first<IterationRow>();
  } else {
    row = await env.DB
      .prepare(
        `SELECT iteration_number, page_html
         FROM design_iterations
         WHERE brief_id = ?
         ORDER BY iteration_number DESC
         LIMIT 1`
      )
      .bind(briefId)
      .first<IterationRow>();
  }
  return row?.page_html ?? null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ briefId: string }> }
) {
  const { briefId } = await ctx.params;
  const url = new URL(req.url);
  const tokenParam = url.searchParams.get("t");

  try {
    const env = getCloudflareContext().env as unknown as Env;

    let iterationNumber: number | null = null;
    let viaToken = false;

    if (tokenParam) {
      const shareRow = await validateShareToken(briefId, tokenParam, env);
      if (!shareRow) return notFound();
      iterationNumber = shareRow.iteration_number;
      viaToken = true;
    } else {
      // Cookie auth fallback — owner viewing their own preview
      if (!(await isOwnerViaCookie(briefId, env))) return notFound();
    }

    const html = await fetchIterationHtml(briefId, iterationNumber, env);
    if (!html) return notFound();

    if (viaToken && tokenParam) {
      // Fire-and-forget view tracking; don't await blocking response
      recordView(tokenParam, env).catch((e) => console.error("recordView", e));
    }

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=0, no-store",
        "X-Frame-Options": "SAMEORIGIN",
      },
    });
  } catch (err) {
    console.error("preview route error", err);
    return notFound();
  }
}
