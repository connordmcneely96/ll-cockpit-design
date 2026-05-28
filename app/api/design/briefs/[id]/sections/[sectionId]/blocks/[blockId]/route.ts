import { cookies } from 'next/headers'
import { validateToken } from '@/lib/auth'
import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type Env = {
  DB: {
    prepare: (sql: string) => {
      bind: (...args: unknown[]) => {
        first: <T = unknown>() => Promise<T | null>
        run: () => Promise<unknown>
      }
    }
  }
}

// DELETE — hard delete a block, scoped to its section to prevent cross-section deletion
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; sectionId: string; blockId: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) return Response.json({ error: 'no_session' }, { status: 401 })

  const auth = await validateToken(token)
  if (!auth) return Response.json({ error: 'invalid_token' }, { status: 401 })

  const { id: briefId, sectionId: sectionSlug, blockId } = await ctx.params

  try {
    const env = getCloudflareContext().env as unknown as Env

    const section = await env.DB
      .prepare(
        `SELECT id FROM design_brief_sections
         WHERE brief_id = ? AND section_slug = ?`,
      )
      .bind(briefId, sectionSlug)
      .first<{ id: string }>()

    if (!section) return Response.json({ error: 'section_not_found' }, { status: 404 })

    await env.DB
      .prepare(
        `DELETE FROM design_section_blocks
         WHERE id = ? AND brief_section_id = ?`,
      )
      .bind(blockId, section.id)
      .run()

    return Response.json({ deleted: true })
  } catch (err) {
    console.error('blocks DELETE error', err)
    return Response.json({ error: 'db_error' }, { status: 500 })
  }
}
