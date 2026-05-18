/**
 * POST /api/design/briefs/[id]/export
 *
 * Sprint 18K Phase B (B2) — returns a ZIP archive of all project files.
 *
 * File source priority:
 *   1. design_brief_files → R2 (real files written by hub ASSEMBLER, post-18K)
 *   2. Virtual extraction from design_iterations (pre-18K fallback)
 *
 * ZIP uses STORE compression (no deflate). No external dependencies —
 * the ZIP format is implemented inline. Files are valid archives compatible
 * with all ZIP tools and OS unpackers.
 *
 * Response: application/zip with filename "{client_name}.zip"
 *
 * TypeScript note: concat() and buildZip() are explicitly typed as returning
 * Uint8Array<ArrayBuffer> (not the wider Uint8Array<ArrayBufferLike>) so the
 * value satisfies BlobPart → ArrayBufferView<ArrayBuffer> in TS 5.x lib.dom.d.ts.
 */
import { cookies } from "next/headers";
import { validateToken } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

type Env = {
  DB: {
    prepare: (sql: string) => {
      bind: (...args: unknown[]) => {
        first: <T = unknown>() => Promise<T | null>;
        all: <T = unknown>() => Promise<{ results: T[] }>;
      };
    };
  };
  R2: {
    get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>;
  };
};

type BriefFileRow = {
  file_path: string;
  r2_key: string;
};

type SubtaskRow = {
  agent_name: string;
  title: string;
  status: string;
  output: string | null;
};

type IterationRow = {
  id: string;
  iteration_number: number;
  design_tokens_json: string | null;
  page_html: string | null;
  orchestrator_run_id: string | null;
};

// ── Minimal ZIP writer (STORE method, no compression) ────────────────────────

function makeCRC32Table(): Uint32Array {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
}

const CRC32_TABLE = makeCRC32Table();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ b) & 0xff];
  return ((crc ^ 0xffffffff) >>> 0);
}

function u16(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
}

function u32(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

// Explicit return type Uint8Array<ArrayBuffer> — new Uint8Array(total) always
// allocates a concrete ArrayBuffer, never a SharedArrayBuffer. Without this
// annotation TypeScript 5.x widens the return to Uint8Array<ArrayBufferLike>,
// which is rejected by BlobPart and BodyInit downstream.
function concat(arrays: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

function buildZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const size = data.length;

    const localHeader = concat([
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0),
      nameBytes,
      data,
    ]);
    localParts.push(localHeader);

    centralParts.push(concat([
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]),
      u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size),
      u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset),
      nameBytes,
    ]));

    offset += localHeader.length;
  }

  const cdData = concat(centralParts);
  const cdOffset = offset;

  const eocd = concat([
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(cdData.length), u32(cdOffset),
    u16(0),
  ]);

  return concat([...localParts, cdData, eocd]);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: briefId } = await ctx.params;

  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token)
    return Response.json({ error: "no_session" }, { status: 401 });

  const auth = await validateToken(token);
  if (!auth)
    return Response.json({ error: "invalid_token" }, { status: 401 });

  try {
    const env = getCloudflareContext().env as unknown as Env;
    const enc = new TextEncoder();

    const brief = await env.DB
      .prepare(
        `SELECT id, client_name, status FROM design_briefs WHERE id = ? AND user_id = ?`,
      )
      .bind(briefId, auth.userId)
      .first<{ id: string; client_name: string; status: string }>();

    if (!brief)
      return Response.json({ error: "not_found" }, { status: 404 });

    const iteration = await env.DB
      .prepare(
        `SELECT i.id, i.iteration_number, i.design_tokens_json, i.page_html,
                b.orchestrator_run_id
         FROM design_iterations i
         JOIN design_briefs b ON b.id = i.brief_id
         WHERE i.brief_id = ? AND b.user_id = ?
         ORDER BY i.iteration_number DESC
         LIMIT 1`,
      )
      .bind(briefId, auth.userId)
      .first<IterationRow>();

    if (!iteration)
      return Response.json({ error: "no_iteration" }, { status: 404 });

    const zipFiles: Array<{ name: string; data: Uint8Array }> = [];

    // ── Source 1: real R2 files (post-18K) ───────────────────────────
    const realFilesResult = await env.DB
      .prepare(
        `SELECT file_path, r2_key
         FROM design_brief_files
         WHERE brief_id = ? AND iteration_id = ?
         ORDER BY source ASC, file_path ASC`,
      )
      .bind(briefId, iteration.id)
      .all<BriefFileRow>();

    const realRows = realFilesResult.results ?? [];

    if (realRows.length > 0) {
      for (const row of realRows) {
        try {
          const obj = await env.R2.get(row.r2_key);
          if (!obj) continue;
          const buf = await obj.arrayBuffer();
          zipFiles.push({ name: row.file_path, data: new Uint8Array(buf) });
        } catch (err) {
          console.error(`export: R2 read failed for ${row.r2_key}`, err);
        }
      }
    } else {
      // ── Source 2: virtual extraction fallback (pre-18K) ──────────────
      if (iteration.design_tokens_json) {
        let pretty = iteration.design_tokens_json;
        try { pretty = JSON.stringify(JSON.parse(iteration.design_tokens_json), null, 2); } catch { /* */ }
        zipFiles.push({ name: "design-tokens.json", data: enc.encode(pretty) });
      }

      if (iteration.orchestrator_run_id) {
        const subtasks = await env.DB
          .prepare(
            `SELECT agent_name, title, status, output
             FROM agent_subtasks
             WHERE pipeline_run_id = ? AND agent_name = 'composer'
               AND status = 'done' AND output IS NOT NULL
             ORDER BY short_id ASC`,
          )
          .bind(iteration.orchestrator_run_id)
          .all<SubtaskRow>();

        for (const t of subtasks.results ?? []) {
          if (!t.output) continue;
          const slug = (t.title ?? "")
            .replace(/^Compose\s+/i, "")
            .replace(/\s+section\s*$/i, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40) || "section";
          zipFiles.push({ name: `components/${slug}.html`, data: enc.encode(t.output) });
        }
      }

      if (iteration.page_html) {
        zipFiles.push({ name: "pages/index.html", data: enc.encode(iteration.page_html) });
        const styleMatch = iteration.page_html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        if (styleMatch?.[1]?.trim()) {
          zipFiles.push({ name: "stylesheets/styles.css", data: enc.encode(styleMatch[1].trim()) });
        }
        const jsxMatch = iteration.page_html.match(/<script[^>]*type=["']text\/jsx["'][^>]*>([\s\S]*?)<\/script>/i);
        if (jsxMatch?.[1]?.trim()) {
          zipFiles.push({ name: "components/app.jsx", data: enc.encode(jsxMatch[1].trim()) });
        }
      }
    }

    if (zipFiles.length === 0)
      return Response.json({ error: "no_files_to_export" }, { status: 404 });

    const zipData = buildZip(zipFiles);
    const safeFilename = brief.client_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project";

    return new Response(new Blob([zipData]), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeFilename}.zip"`,
        "Content-Length": String(zipData.length),
      },
    });
  } catch (err) {
    console.error("export route error", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "export_failed" },
      { status: 500 },
    );
  }
}
