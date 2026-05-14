/**
 * GET /api/design/briefs — local proxy to ll-cockpit hub
 * Reads sb-access-token cookie, forwards as Authorization Bearer.
 * Called client-side by DesignLandingClient on mount.
 */
import { cookies } from 'next/headers'
import { cockpitFetch } from '@/lib/cockpit-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value

  if (!token) {
    return Response.json({ briefs: [], error: 'no_session' }, { status: 401 })
  }

  try {
    const res = await cockpitFetch('/api/design/briefs?limit=30', token)
    if (!res.ok) {
      const text = await res.text()
      return Response.json({ briefs: [], error: text }, { status: res.status })
    }
    const data = await res.json()
    return Response.json({ briefs: Array.isArray(data?.briefs) ? data.briefs : [] })
  } catch (err) {
    return Response.json(
      { briefs: [], error: err instanceof Error ? err.message : 'fetch_failed' },
      { status: 500 }
    )
  }
}
