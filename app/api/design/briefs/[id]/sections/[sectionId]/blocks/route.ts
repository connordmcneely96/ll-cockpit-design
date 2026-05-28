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

type BlockSettingDef = { id: string; label?: string; default?: unknown }
type BlockDef = { type: string; name?: string; limit?: number; settings?: BlockSettingDef[] }

type SectionRow = { section_id: string; schema_json: string | null }
type BlockRow = { id: string; block_type: string; sort_order: number; settings_json: string | null }

async function resolveSection(
  env: Env,
  briefId: string,
  sectionSlug: string,
): Promise<SectionRow | null> {
  return env.DB
    .prepare(
      `SELECT s.id AS section_id, t.schema_json
       FROM design_brief_sections s
       LEFT JOIN design_section_types t ON t.slug = s.section_type_slug
       WHERE s.brief_id = ? AND s.section_slug = ?`,
    )
    .bind(briefId, sectionSlug)
    .first<SectionRow>()
}

function parseBlockDefs(schemaJson: string | null): BlockDef[] {
  if (!schemaJson) return []
  try {
    const parsed = JSON.parse(schemaJson) as { blocks?: BlockDef[] }
    return Array.isArray(parsed.blocks) ? parsed.blocks : []
  } catch {
    return []
  }
}

// GET — active blocks for the section + valid block type definitions
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; sectionId: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) return Response.json({ error: 'no_session' }, { status: 401 })

  const auth = await validateToken(token)
  if (!auth) return Response.json({ error: 'invalid_token' }, { status: 401 })

  const { id: briefId, sectionId: sectionSlug } = await ctx.params

  try {
    const env = getCloudflareContext().env as unknown as Env

    const section = await resolveSection(env, briefId, sectionSlug)
    if (!section) return Response.json({ error: 'section_not_found' }, { status: 404 })

    const blockDefs = parseBlockDefs(section.schema_json)

    const { results } = await env.DB
      .prepare(
        `SELECT id, block_type, sort_order, settings_json
         FROM design_section_blocks
         WHERE brief_section_id = ? AND status = 'active'
         ORDER BY sort_order ASC`,
      )
      .bind(section.section_id)
      .all<BlockRow>()

    return Response.json({ blocks: results ?? [], blockDefs })
  } catch (err) {
    console.error('blocks GET error', err)
    return Response.json({ error: 'db_error' }, { status: 500 })
  }
}

// POST — create a new block instance
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; sectionId: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) return Response.json({ error: 'no_session' }, { status: 401 })

  const auth = await validateToken(token)
  if (!auth) return Response.json({ error: 'invalid_token' }, { status: 401 })

  const { id: briefId, sectionId: sectionSlug } = await ctx.params

  let body: { block_type?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const blockType = body.block_type
  if (!blockType) return Response.json({ error: 'block_type_required' }, { status: 400 })

  try {
    const env = getCloudflareContext().env as unknown as Env

    const section = await resolveSection(env, briefId, sectionSlug)
    if (!section) return Response.json({ error: 'section_not_found' }, { status: 404 })

    const blockDefs = parseBlockDefs(section.schema_json)
    const def = blockDefs.find((b) => b.type === blockType)
    if (!def) return Response.json({ error: 'invalid_block_type' }, { status: 400 })

    const settings: Record<string, unknown> = {}
    for (const s of def.settings ?? []) {
      settings[s.id] = s.default ?? null
    }

    const maxRow = await env.DB
      .prepare(
        `SELECT MAX(sort_order) AS max_sort
         FROM design_section_blocks
         WHERE brief_section_id = ?`,
      )
      .bind(section.section_id)
      .first<{ max_sort: number | null }>()

    const sortOrder = (maxRow?.max_sort ?? 0) + 1
    const newId = crypto.randomUUID()

    await env.DB
      .prepare(
        `INSERT INTO design_section_blocks
         (id, brief_section_id, block_type, sort_order, settings_json, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', unixepoch(), unixepoch())`,
      )
      .bind(newId, section.section_id, blockType, sortOrder, JSON.stringify(settings))
      .run()

    const created = await env.DB
      .prepare(
        `SELECT id, block_type, sort_order, settings_json
         FROM design_section_blocks WHERE id = ?`,
      )
      .bind(newId)
      .first<BlockRow>()

    return Response.json({ block: created })
  } catch (err) {
    console.error('blocks POST error', err)
    return Response.json({ error: 'db_error' }, { status: 500 })
  }
}
