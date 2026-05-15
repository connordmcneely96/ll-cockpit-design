/**
 * GET /api/design/briefs — list user's briefs (direct D1 query)
 * POST /api/design/briefs — create new brief (calls ll-cockpit via service binding)
 *
 * Per Sprint 20 ADR: cross-Worker calls go through service bindings (env.HUB),
 * not via public URL. Public-URL calls between Workers cause Cloudflare error 1042.
 *
 * Sprint 18E: POST forwards attached_design_system_slug to hub when provided.
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
  HUB: {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>
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
  // Sprint 18E — optional design system slug. If set, hub loads the system
  // from R2 and passes its DESIGN.md to DESIGNER as upstream context.
  attached_design_system_slug?: string
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

  // Call ll-cockpit via service binding (not public URL — that causes 1042)
  try {
    const env = getCloudflareContext().env as unknown as Env

    const hubRes = await env.HUB.fetch(
      'https://ll-cockpit.connorpattern.workers.dev/api/design/briefs',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    )

    if (!hubRes.ok) {
      const errText = await hubRes.text()
      console.error('hub POST /api/design/briefs failed', hubRes.status, errText)
      return Response.json(
        {
          error: 'pipeline_dispatch_failed',
          upstream_status: hubRes.status,
          detail: errText,
        },
        { status: hubRes.status }
      )
    }

    const hubData = await hubRes.json() as {
      brief_id?: string
      orchestrator_run_id?: string
      subtask_count?: number
      attached_design_system?: { slug: string; name: string } | null
    }

    if (!hubData?.brief_id) {
      console.error('hub returned no brief_id', hubData)
      return Response.json(
        { error: 'no_brief_id_returned', detail: JSON.stringify(hubData) },
        { status: 502 }
      )
    }

    // Patch skill_hint + project_type into the brief row we just inserted
    if (body.skill_hint || body.project_type) {
      try {
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
            hubData.brief_id,
            auth.userId
          )
          .run()
      } catch (err) {
        console.error('skill_hint UPDATE failed (non-fatal)', err)
      }
    }

    return Response.json({
      ok: true,
      brief_id: hubData.brief_id,
      orchestrator_run_id: hubData.orchestrator_run_id,
      subtask_count: hubData.subtask_count,
      attached_design_system: hubData.attached_design_system ?? null,
    })
  } catch (err) {
    console.error('briefs POST service binding error', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'service_binding_failed' },
      { status: 500 }
    )
  }
}
