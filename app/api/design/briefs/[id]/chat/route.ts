/**
 * POST /api/design/briefs/[id]/chat — Sprint 16 v0.3 Slice 1
 * GET  /api/design/briefs/[id]/chat — list prior messages
 *
 * Proxies the iteration agent chat to the hub via service binding.
 * Per Sprint 20 ADR: cross-Worker calls go through env.HUB.fetch, never
 * via public URL.
 *
 * The hub (POST /api/design/briefs/[id]/chat) accepts Authorization: Bearer
 * and runs the iteration agent (update_design_tokens, regenerate_section,
 * critique, save_iteration, apply_token_to_html — see iteration-agent.ts).
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

  try {
    const env = getCloudflareContext().env as unknown as Env
    const hubRes = await env.HUB.fetch(
      `${HUB_BASE}/api/design/briefs/${briefId}/chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    )

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
