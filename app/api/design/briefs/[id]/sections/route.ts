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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) {
    return Response.json({ sections: [], error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ sections: [], error: 'invalid_token' }, { status: 401 })
  }

  const { id: briefId } = await ctx.params

  try {
    const env = getCloudflareContext().env as unknown as Env
    const hubRes = await env.HUB.fetch(
      `${HUB_BASE}/api/design/briefs/${briefId}/sections`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (!hubRes.ok) {
      const errText = await hubRes.text()
      console.error('hub GET /sections failed', hubRes.status, errText)
      return Response.json(
        { sections: [], error: 'hub_error', upstream_status: hubRes.status },
        { status: hubRes.status },
      )
    }

    const data = await hubRes.json()
    return Response.json(data)
  } catch (err) {
    console.error('sections GET service binding error', err)
    return Response.json(
      { sections: [], error: err instanceof Error ? err.message : 'service_binding_failed' },
      { status: 500 },
    )
  }
}
