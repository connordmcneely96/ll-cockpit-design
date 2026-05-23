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
    return Response.json({ section_types: [], error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ section_types: [], error: 'invalid_token' }, { status: 401 })
  }

  const url = new URL(req.url)
  const hubUrl = new URL('https://ll-cockpit.connorpattern.workers.dev/api/design/section-types')
  url.searchParams.forEach((v, k) => hubUrl.searchParams.set(k, v))

  try {
    const env = getCloudflareContext().env as unknown as Env
    const hubRes = await env.HUB.fetch(hubUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!hubRes.ok) {
      const errText = await hubRes.text()
      console.error('hub GET /api/design/section-types failed', hubRes.status, errText)
      return Response.json(
        { section_types: [], error: 'hub_error', upstream_status: hubRes.status },
        { status: hubRes.status }
      )
    }

    const data = await hubRes.json()
    return Response.json(data)
  } catch (err) {
    console.error('section-types GET service binding error', err)
    return Response.json(
      { section_types: [], error: err instanceof Error ? err.message : 'service_binding_failed' },
      { status: 500 }
    )
  }
}
