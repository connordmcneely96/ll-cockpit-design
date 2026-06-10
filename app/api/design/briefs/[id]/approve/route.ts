import { cookies } from 'next/headers'
import { validateToken } from '@/lib/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type Env = {
  HUB: {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: briefId } = await ctx.params

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
      `https://ll-cockpit.connorpattern.workers.dev/api/design/briefs/${briefId}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: '{}',
      }
    )

    if (!hubRes.ok) {
      const detail = await hubRes.text()
      console.error('hub POST approve failed', hubRes.status, detail)
      return Response.json(
        { error: 'approve_failed', upstream_status: hubRes.status, detail },
        { status: hubRes.status }
      )
    }

    const hubData = await hubRes.json()
    return Response.json(hubData)
  } catch (err) {
    console.error('approve service binding error', err)
    return Response.json({ error: 'service_binding_failed' }, { status: 500 })
  }
}
