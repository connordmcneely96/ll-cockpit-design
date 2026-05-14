/**
 * GET /api/design/briefs — list user's briefs (direct D1 query)
 * POST /api/design/briefs — create new brief (proxies to ll-cockpit which runs the pipeline)
 *
 * Per Sprint 20 ADR: design Worker shares ll-cockpit-db D1 binding.
 * GET reads D1 directly. POST proxies to ll-cockpit because the pipeline
 * orchestrator + buildDesignBuildDAG + runAutoWave live there.
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
        run: () => Promise<unknown>
      }
    }
  }
}

const COCKPIT_BASE = 'https://ll-cockpit.connorpattern.workers.dev'

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
        `SELECT id, client_name, status, preview_url, created_at, updated_at
         FROM design_briefs
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 30`
      )
      .bind(auth.userId)
      .all()

    return Response.json({ briefs: rows.results ?? [] })
  } catch (err) {
    console.error('briefs GET error', err)
    return Response.json(
      { briefs: [], error: err instanceof Error ? err.message : 'db_error' },
      { status: 500 }
    )
  }
}

type CreateBriefBody = {
  client_name?: string
  business_description?: string
  target_audience?: string
  mood_tone?: string
  must_have_sections?: string
  style_references?: string[]
  brand_colors?: string
  constraints?: string
  skill_hint?: string
  project_type?: string
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value

  if (!token) {
    return Response.json({ error: 'no_session' }, { status: 401 })
  }

  const auth = await validateToken(token)
  if (!auth) {
    return Response.json({ error: 'invalid_token' }, { status: 401 })
  }

  let body: CreateBriefBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  // Required field check before proxying
  const required: Array<keyof CreateBriefBody> = [
    'client_name', 'business_description', 'target_audience',
    'mood_tone', 'must_have_sections',
  ]
  for (const f of required) {
    const val = body[f]
    if (!val || (typeof val === 'string' && !val.trim())) {
      return Response.json({ error: `${f}_required` }, { status: 400 })
    }
  }

  // Proxy to ll-cockpit's POST /api/design/briefs which:
  //  1. inserts design_briefs row
  //  2. builds DESIGNER → COMPOSER × N → ASSEMBLER → CRITIC DAG
  //  3. fires runAutoWave (the actual pipeline)
  //  4. returns brief_id + run_id
  try {
    const proxyRes = await fetch(`${COCKPIT_BASE}/api/design/briefs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    })

    if (!proxyRes.ok) {
      const errText = await proxyRes.text()
      console.error('cockpit POST /api/design/briefs failed', proxyRes.status, errText)
      return Response.json(
        { error: 'pipeline_dispatch_failed', detail: errText },
        { status: proxyRes.status }
      )
    }

    const cockpitData = await proxyRes.json()

    // After successful pipeline kick-off, update our local D1 row with
    // skill_hint + project_type (ll-cockpit POST doesn't accept these yet,
    // so we patch them in here).
    if (body.skill_hint || body.project_type) {
      try {
        const env = getCloudflareContext().env as unknown as Env
        await env.DB
          .prepare(
            `UPDATE design_briefs
             SET skill_hint = COALESCE(?, skill_hint),
                 project_type = COALESCE(?, project_type),
                 updated_at = ?
             WHERE id = ? AND user_id = ?`
          )
          .bind(
            body.skill_hint ?? null,
            body.project_type ?? null,
            Math.floor(Date.now() / 1000),
            cockpitData.brief_id,
            auth.userId
          )
          .run()
      } catch (err) {
        // Non-fatal — brief is created, just missing hint columns
        console.error('skill_hint UPDATE failed (non-fatal)', err)
      }
    }

    return Response.json({
      ok: true,
      brief_id: cockpitData.brief_id,
      orchestrator_run_id: cockpitData.orchestrator_run_id,
      subtask_count: cockpitData.subtask_count,
    })
  } catch (err) {
    console.error('briefs POST proxy error', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'proxy_failed' },
      { status: 500 }
    )
  }
}
