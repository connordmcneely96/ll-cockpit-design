/**
 * Share token CRUD for a brief.
 * Owner-only operations. Tenant isolated via design_briefs.user_id check.
 *
 * GET    /api/design/briefs/[id]/share          → list active tokens
 * POST   /api/design/briefs/[id]/share          → create token { expires_in_hours?: number }
 * DELETE /api/design/briefs/[id]/share?token=X  → revoke token
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
        run: () => Promise<unknown>;
      };
    };
  };
};

type ShareTokenRow = {
  token: string;
  brief_id: string;
  iteration_number: number | null;
  created_by_user_id: string;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  view_count: number;
  last_viewed_at: number | null;
};

async function requireOwner(briefId: string, userId: string, env: Env): Promise<boolean> {
  const row = await env.DB
    .prepare(`SELECT id FROM design_briefs WHERE id = ? AND user_id = ?`)
    .bind(briefId, userId)
    .first<{ id: string }>();
  return row !== null;
}

function generateToken(): string {
  // 32 chars, URL-safe base64-like alphabet
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"[b & 63])
    .join("");
}

async function authOrReject(): Promise<{ userId: string } | Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return Response.json({ error: "no_session" }, { status: 401 });
  const auth = await validateToken(token);
  if (!auth) return Response.json({ error: "invalid_token" }, { status: 401 });
  return { userId: auth.userId };
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;
  const auth = await authOrReject();
  if (auth instanceof Response) return auth;

  try {
    const env = getCloudflareContext().env as unknown as Env;
    if (!(await requireOwner(briefId, auth.userId, env))) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const rows = await env.DB
      .prepare(
        `SELECT token, brief_id, iteration_number, created_by_user_id,
                created_at, expires_at, revoked_at, view_count, last_viewed_at
         FROM design_share_tokens
         WHERE brief_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC`
      )
      .bind(briefId)
      .all<ShareTokenRow>();

    return Response.json({ tokens: rows.results ?? [] });
  } catch (err) {
    console.error("share GET error", err);
    return Response.json({ error: "db_error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;
  const auth = await authOrReject();
  if (auth instanceof Response) return auth;

  let body: { expires_in_hours?: number | null } = {};
  try {
    body = await req.json();
  } catch {
    // empty body = default 7d
  }

  try {
    const env = getCloudflareContext().env as unknown as Env;
    if (!(await requireOwner(briefId, auth.userId, env))) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const token = generateToken();
    const now = Math.floor(Date.now() / 1000);
    // null/undefined → default 7d; explicit 0 or negative → never expires
    const hoursRaw = body.expires_in_hours;
    const expiresAt =
      hoursRaw === undefined || hoursRaw === null
        ? now + 7 * 24 * 3600
        : hoursRaw <= 0
        ? null
        : now + Math.floor(hoursRaw * 3600);

    await env.DB
      .prepare(
        `INSERT INTO design_share_tokens
         (token, brief_id, iteration_number, created_by_user_id,
          created_at, expires_at, view_count)
         VALUES (?, ?, NULL, ?, ?, ?, 0)`
      )
      .bind(token, briefId, auth.userId, now, expiresAt)
      .run();

    const shareUrl = `https://design.connorpattern.workers.dev/design/preview/${briefId}?t=${token}`;

    return Response.json({
      token,
      url: shareUrl,
      brief_id: briefId,
      created_at: now,
      expires_at: expiresAt,
    });
  } catch (err) {
    console.error("share POST error", err);
    return Response.json({ error: "db_error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;
  const auth = await authOrReject();
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return Response.json({ error: "token_required" }, { status: 400 });
  }

  try {
    const env = getCloudflareContext().env as unknown as Env;
    if (!(await requireOwner(briefId, auth.userId, env))) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const now = Math.floor(Date.now() / 1000);
    await env.DB
      .prepare(
        `UPDATE design_share_tokens
         SET revoked_at = ?
         WHERE token = ? AND brief_id = ? AND revoked_at IS NULL`
      )
      .bind(now, token, briefId)
      .run();

    return Response.json({ revoked: true, token });
  } catch (err) {
    console.error("share DELETE error", err);
    return Response.json({ error: "db_error" }, { status: 500 });
  }
}
