/**
 * GET /api/design/briefs — direct D1 query from design Worker
 *
 * Per Sprint 20 ADR: design Worker shares ll-cockpit-db D1 binding.
 * No proxy needed — query design_briefs directly.
 */
import { cookies } from 'next/headers'
import { validateToken } from '@/lib/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type Env = {
  DB: {
    prepare: (sql: string) => {
      bind: (...args: unknown[]) => {
        all: () => Promise<{ results: unknown[] }>
      }
    }
  }
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value

  if (!token) {
    return Response.json({ briefs: [], error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ briefs: [], error: 'invalid_token' }, { status: 401 })
  }

  try {
    const env = getCloudflareContext().env as unknown as Env
    const rows = await env.DB
      .prepare(
        `SELECT id, client_name, project_name, status, created_at, updated_at
         FROM design_briefs
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 30`
      )
      .bind(auth.userId)
      .all()

    return Response.json({ briefs: rows.results ?? [] })
  } catch (err) {
    return Response.json(
      { briefs: [], error: err instanceof Error ? err.message : 'db_error' },
      { status: 500 }
    )
  }
}
