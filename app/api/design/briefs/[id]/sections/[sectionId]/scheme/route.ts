import { cookies } from 'next/headers'
import { validateToken } from '@/lib/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type Env = {
  DB: {
    prepare: (sql: string) => {
      bind: (...args: unknown[]) => {
        first: <T = unknown>() => Promise<T | null>
        all: <T = unknown>() => Promise<{ results: T[] }>
        run: () => Promise<unknown>
      }
    }
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; sectionId: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) return Response.json({ error: 'no_session' }, { status: 401 })

  const auth = await validateToken(token)
  if (!auth) return Response.json({ error: 'invalid_token' }, { status: 401 })

  const { id: briefId, sectionId: sectionSlug } = await ctx.params

  let body: { scheme_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const schemeId = body.scheme_id === null ? null : body.scheme_id
  if (schemeId !== null && typeof schemeId !== 'string') {
    return Response.json({ error: 'scheme_id_must_be_string_or_null' }, { status: 400 })
  }

  try {
    const env = getCloudflareContext().env as unknown as Env

    const section = await env.DB
      .prepare(`SELECT id FROM design_brief_sections WHERE brief_id = ? AND section_slug = ?`)
      .bind(briefId, sectionSlug)
      .first<{ id: string }>()

    if (!section) return Response.json({ error: 'section_not_found' }, { status: 404 })

    if (schemeId !== null) {
      const scheme = await env.DB
        .prepare(`SELECT id FROM design_color_schemes WHERE id = ? AND brief_id = ?`)
        .bind(schemeId, briefId)
        .first<{ id: string }>()

      if (!scheme) return Response.json({ error: 'scheme_not_found' }, { status: 404 })
    }

    await env.DB
      .prepare(`UPDATE design_brief_sections SET scheme_id = ? WHERE id = ?`)
      .bind(schemeId, section.id)
      .run()

    return Response.json({ updated: true })
  } catch (err) {
    console.error('section scheme PATCH error', err)
    return Response.json({ error: 'db_error' }, { status: 500 })
  }
}
