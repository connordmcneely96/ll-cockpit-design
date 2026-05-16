/**
 * POST /api/design/briefs/[id]/chat — Sprint 16 v0.5.0 (live streaming)
 * GET  /api/design/briefs/[id]/chat — list prior messages (unchanged)
 *
 * Proxies the iteration agent chat to the hub via service binding.
 * Per Sprint 20 ADR: cross-Worker calls go through env.HUB.fetch, never
 * via public URL.
 *
 * STREAMING PATH (v0.5.0):
 *   When the client sends `Accept: text/event-stream`, this route forwards
 *   that header to the hub and pipes the hub's SSE body straight back to
 *   the client without buffering. Using `await hubRes.json()` here would
 *   collect the entire response before flushing — that's what we had
 *   previously and it's why tool cards only appeared after the whole
 *   agent loop finished. Now they arrive one at a time.
 *
 * LEGACY JSON PATH:
 *   When the client doesn't request streaming (or hubRes.body is unexpectedly
 *   empty), we fall back to the v0.4 JSON path with turn_messages. Kept for
 *   non-browser API consumers and as a defensive fallback.
 */
import { cookies } from 'next/headers'
import { validateToken } from '@/lib/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type Env = {
  HUB: {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>
  }
}

const HUB_BASE = 'https://ll-cockpit.connorpattern.workers.dev'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) {
    return Response.json({ ok: false, error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ ok: false, error: 'invalid_token' }, { status: 401 })
  }

  const { id: briefId } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  // v0.5.0 — detect streaming request from the browser
  const wantsStream = (req.headers.get('accept') ?? '').includes(
    'text/event-stream',
  )

  try {
    const env = getCloudflareContext().env as unknown as Env
    const hubRes = await env.HUB.fetch(
      `${HUB_BASE}/api/design/briefs/${briefId}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          // Forward the Accept header so the hub knows to emit SSE
          ...(wantsStream ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify(body),
      },
    )

    // v0.5.0 — when the client wants streaming AND the hub returned a body,
    // pass the body through untouched. Cloudflare service bindings preserve
    // streaming for both request and response bodies, so the SSE chunks
    // flow client-side as the hub emits them.
    //
    // CRITICAL: do not call hubRes.json() / hubRes.text() / hubRes.arrayBuffer()
    // here — any of those would buffer the full response, collapsing back to
    // the v0.4 "all at once" behavior.
    if (wantsStream && hubRes.body) {
      return new Response(hubRes.body, {
        status: hubRes.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          // Defensive against Cloudflare buffering when the response is
          // proxied through extra hops. Real-time SSE relies on flushing
          // each event as it's enqueued upstream.
          'X-Accel-Buffering': 'no',
        },
      })
    }

    // Legacy JSON path — non-streaming clients keep working.
    const data = await hubRes.json().catch(() => ({
      ok: false,
      error: 'hub_returned_non_json',
    }))

    if (!hubRes.ok) {
      console.error('hub POST /chat failed', hubRes.status, data)
    }

    return Response.json(data, { status: hubRes.status })
  } catch (err) {
    console.error('chat POST service binding error', err)
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'service_binding_failed',
      },
      { status: 500 },
    )
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) {
    return Response.json({ messages: [], error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ messages: [], error: 'invalid_token' }, { status: 401 })
  }

  const { id: briefId } = await ctx.params

  try {
    const env = getCloudflareContext().env as unknown as Env
    const hubRes = await env.HUB.fetch(
      `${HUB_BASE}/api/design/briefs/${briefId}/chat`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (!hubRes.ok) {
      const errText = await hubRes.text()
      console.error('hub GET /chat failed', hubRes.status, errText)
      return Response.json(
        { messages: [], error: 'hub_error', upstream_status: hubRes.status },
        { status: hubRes.status },
      )
    }

    const data = await hubRes.json()
    return Response.json(data)
  } catch (err) {
    console.error('chat GET service binding error', err)
    return Response.json(
      {
        messages: [],
        error: err instanceof Error ? err.message : 'service_binding_failed',
      },
      { status: 500 },
    )
  }
}
