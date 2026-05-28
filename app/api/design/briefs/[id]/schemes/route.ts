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

type SchemeRow = { id: string; name: string; palette_json: string; sort_order: number; is_preset: number }

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function validatePalette(p: unknown): p is { bg: string; text: string; accent: string; border: string } {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    typeof o.bg === 'string' && HEX_RE.test(o.bg) &&
    typeof o.text === 'string' && HEX_RE.test(o.text) &&
    typeof o.accent === 'string' && HEX_RE.test(o.accent) &&
    typeof o.border === 'string' && HEX_RE.test(o.border)
  )
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) return Response.json({ error: 'no_session' }, { status: 401 })

  const auth = await validateToken(token)
  if (!auth) return Response.json({ error: 'invalid_token' }, { status: 401 })

  const { id: briefId } = await ctx.params

  try {
    const env = getCloudflareContext().env as unknown as Env
    const { results } = await env.DB
      .prepare(
        `SELECT id, name, palette_json, sort_order, is_preset
         FROM design_color_schemes
         WHERE brief_id = ?
         ORDER BY sort_order ASC`,
      )
      .bind(briefId)
      .all<SchemeRow>()

    return Response.json({ schemes: results ?? [] })
  } catch (err) {
    console.error('schemes GET error', err)
    return Response.json({ error: 'db_error' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('sb-access-token')?.value
  if (!token) return Response.json({ error: 'no_session' }, { status: 401 })

  const auth = await validateToken(token)
  if (!auth) return Response.json({ error: 'invalid_token' }, { status: 401 })

  const { id: briefId } = await ctx.params

  let body: { name?: unknown; palette_json?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  if (typeof body.name !== 'string' || !body.name.trim()) {
    return Response.json({ error: 'name_required' }, { status: 400 })
  }
  if (!validatePalette(body.palette_json)) {
    return Response.json({ error: 'invalid_palette_json' }, { status: 400 })
  }

  try {
    const env = getCloudflareContext().env as unknown as Env

    const maxRow = await env.DB
      .prepare(`SELECT MAX(sort_order) AS max_sort FROM design_color_schemes WHERE brief_id = ?`)
      .bind(briefId)
      .first<{ max_sort: number | null }>()

    const sortOrder = (maxRow?.max_sort ?? 0) + 1
    const newId = crypto.randomUUID()
    const paletteStr = JSON.stringify(body.palette_json)

    await env.DB
      .prepare(
        `INSERT INTO design_color_schemes (id, brief_id, name, palette_json, sort_order, is_preset)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .bind(newId, briefId, body.name.trim(), paletteStr, sortOrder)
      .run()

    const created = await env.DB
      .prepare(
        `SELECT id, name, palette_json, sort_order, is_preset
         FROM design_color_schemes WHERE id = ?`,
      )
      .bind(newId)
      .first<SchemeRow>()

    return Response.json({ scheme: created }, { status: 201 })
  } catch (err) {
    console.error('schemes POST error', err)
    return Response.json({ error: 'db_error' }, { status: 500 })
  }
}
