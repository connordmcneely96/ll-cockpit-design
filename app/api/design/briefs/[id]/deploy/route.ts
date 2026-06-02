/**
 * Worker bridge for brief deployment.
 * Forwards cookie auth → Bearer to the hub via the HUB service binding.
 * Never fetches a public URL — uses env.HUB.fetch() only.
 *
 * POST → trigger deploy
 * GET  → fetch deployment badge status
 */
import { cookies } from "next/headers";
import { validateToken } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type Fetcher = { fetch: (req: Request) => Promise<Response> };

type Env = {
  HUB: Fetcher;
};

async function authOrReject(): Promise<{ userId: string; token: string } | Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return Response.json({ error: "no_session" }, { status: 401 });
  const auth = await validateToken(token);
  if (!auth) return Response.json({ error: "invalid_token" }, { status: 401 });
  return { userId: auth.userId, token };
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;
  const auth = await authOrReject();
  if (auth instanceof Response) return auth;

  try {
    const env = getCloudflareContext().env as unknown as Env;
    const hubReq = new Request(
      `https://ll-cockpit/api/design/briefs/${briefId}/deploy`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}` },
      }
    );
    const hubRes = await env.HUB.fetch(hubReq);
    const contentType = hubRes.headers.get("content-type") ?? "application/json";
    return new Response(hubRes.body, {
      status: hubRes.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    console.error("deploy POST bridge error", err);
    return Response.json({ error: "deploy bridge failed" }, { status: 502 });
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: briefId } = await ctx.params;
  const auth = await authOrReject();
  if (auth instanceof Response) return auth;

  try {
    const env = getCloudflareContext().env as unknown as Env;
    const hubReq = new Request(
      `https://ll-cockpit/api/design/briefs/${briefId}/deploy`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${auth.token}` },
      }
    );
    const hubRes = await env.HUB.fetch(hubReq);
    const contentType = hubRes.headers.get("content-type") ?? "application/json";
    return new Response(hubRes.body, {
      status: hubRes.status,
      headers: { "content-type": contentType },
    });
  } catch (err) {
    console.error("deploy GET bridge error", err);
    return Response.json({ error: "deploy bridge failed" }, { status: 502 });
  }
}
