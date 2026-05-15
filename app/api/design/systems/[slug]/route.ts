/**
 * GET /api/design/systems/[slug] — full design system data (proxies to hub)
 *
 * Sprint 18E. IntakeClient calls this when ?system=slug is set so it can
 * surface the system name, primary color, and tags in the banner.
 *
 * Per Sprint 20 ADR: cross-Worker calls go through env.HUB service binding.
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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value

  if (!token) {
    return Response.json({ error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ error: 'invalid_token' }, { status: 401 })
  }

  try {
    const env = getCloudflareContext().env as unknown as Env
    const hubRes = await env.HUB.fetch(
      `https://ll-cockpit.connorpattern.workers.dev/api/design/systems/${encodeURIComponent(slug)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!hubRes.ok) {
      const errText = await hubRes.text()
      console.error('hub GET /api/design/systems/[slug] failed', hubRes.status, errText)
      return Response.json(
        { error: 'hub_error', upstream_status: hubRes.status },
        { status: hubRes.status }
      )
    }

    const data = await hubRes.json()
    return Response.json(data)
  } catch (err) {
    console.error('systems/[slug] GET service binding error', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'service_binding_failed' },
      { status: 500 }
    )
  }
}
