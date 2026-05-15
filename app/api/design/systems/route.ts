/**
 * GET /api/design/systems — list available design systems (proxies to hub)
 *
 * Sprint 18E. The hub owns the design_systems data (D1 + R2). This proxy
 * forwards the authenticated user's request to the hub via service binding.
 *
 * Per Sprint 20 ADR: cross-Worker calls go through service bindings (env.HUB),
 * not via public URL.
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

export async function GET(req: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value

  if (!token) {
    return Response.json({ systems: [], error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ systems: [], error: 'invalid_token' }, { status: 401 })
  }

  // Forward query params (?category=, ?tag=, ?limit=) to the hub
  const url = new URL(req.url)
  const hubUrl = new URL('https://ll-cockpit.connorpattern.workers.dev/api/design/systems')
  url.searchParams.forEach((v, k) => hubUrl.searchParams.set(k, v))

  try {
    const env = getCloudflareContext().env as unknown as Env
    const hubRes = await env.HUB.fetch(hubUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!hubRes.ok) {
      const errText = await hubRes.text()
      console.error('hub GET /api/design/systems failed', hubRes.status, errText)
      return Response.json(
        { systems: [], error: 'hub_error', upstream_status: hubRes.status },
        { status: hubRes.status }
      )
    }

    const data = await hubRes.json()
    return Response.json(data)
  } catch (err) {
    console.error('systems GET service binding error', err)
    return Response.json(
      { systems: [], error: err instanceof Error ? err.message : 'service_binding_failed' },
      { status: 500 }
    )
  }
}
