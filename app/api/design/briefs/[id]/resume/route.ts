/**
 * POST /api/design/briefs/[id]/resume — Sprint 18G design-Worker proxy
 *
 * Same-origin proxy to the hub's resume endpoint. The canvas (running
 * on this design Worker) auto-calls this when it detects a brief has
 * been stuck in 'building' status with failed subtasks for >90 seconds.
 *
 * Why a proxy: the hub's resume endpoint accepts Bearer token, but the
 * canvas only has the cookie. This route validates the cookie locally,
 * extracts the token, and forwards the request via the HUB service binding
 * — the same Hub & Spoke v1.1 pattern as briefs/route.ts POST.
 */

import { cookies } from "next/headers";
import { validateToken } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type Env = {
  HUB: {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
  };
};

export async function POST(
  _req: Request,
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

    // Forward to hub via service binding (Sprint 20 ADR rule — never public URL)
    const hubRes = await env.HUB.fetch(
      `https://ll-cockpit.connorpattern.workers.dev/api/design/briefs/${briefId}/resume`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!hubRes.ok) {
      const errText = await hubRes.text();
      console.error("hub resume failed", hubRes.status, errText);
      return Response.json(
        {
          error: "resume_failed",
          upstream_status: hubRes.status,
          detail: errText.slice(0, 300),
        },
        { status: hubRes.status }
      );
    }

    const hubData = await hubRes.json();
    return Response.json(hubData);
  } catch (err) {
    console.error("resume proxy error", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "service_binding_failed" },
      { status: 500 }
    );
  }
}
