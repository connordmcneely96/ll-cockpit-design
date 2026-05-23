"use client"

import { useState } from "react"
import type { Subtask } from "./page"

function slugFromTitle(title: string): { name: string; slug: string } {
  const match = title.match(/Compose\s+(.+?)\s+section/i)
  const name = match
    ? match[1]
    : title.replace(/^Compose\s+/i, '').replace(/\s+section$/i, '')
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return { name, slug }
}

type Props = {
  briefId: string
  subtasks: Subtask[]
  onSectionAction: () => void
  onOpenAdd: () => void
}

export default function SectionTree({ briefId, subtasks, onSectionAction, onOpenAdd }: Props) {
  const [confirmingSlug, setConfirmingSlug] = useState<string | null>(null)
  const [removingSlug, setRemovingSlug] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  const sections = subtasks
    .filter(s => s.agent === 'composer' && s.status === 'done')
    .map(s => slugFromTitle(s.title))

  async function handleRemove(slug: string) {
    setRemovingSlug(slug)
    setConfirmingSlug(null)
    setRowErrors(prev => { const next = { ...prev }; delete next[slug]; return next })

    const message = `Use the remove_section tool with section_slug="${slug}". After removing, call save_iteration to commit the change. Do not modify any remaining sections.`

    try {
      const res = await fetch(`/api/design/briefs/${briefId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onSectionAction()
    } catch (err) {
      setRowErrors(prev => ({
        ...prev,
        [slug]: err instanceof Error ? err.message : 'Remove failed',
      }))
    } finally {
      setRemovingSlug(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {sections.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--design-ink3)',
            }}
          >
            No sections yet. Add one below.
          </div>
        ) : (
          sections.map(({ name, slug }) => {
            const isRemoving = removingSlug === slug
            const isConfirming = confirmingSlug === slug
            const error = rowErrors[slug]

            return (
              <div
                key={slug}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--design-border)',
                  opacity: isRemoving ? 0.5 : 1,
                  pointerEvents: isRemoving ? 'none' : 'auto',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--design-ink)' }}>
                    {name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: 'monospace',
                      color: 'var(--design-ink3)',
                      background: 'var(--design-border)',
                      borderRadius: 3,
                      padding: '1px 5px',
                    }}
                  >
                    {slug}
                  </span>

                  {isRemoving ? (
                    <span style={{ fontSize: 11, color: 'var(--design-ink3)', flexShrink: 0 }}>Removing…</span>
                  ) : isConfirming ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--design-ink3)' }}>Delete?</span>
                      <button
                        onClick={() => handleRemove(slug)}
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          background: '#dc2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmingSlug(null)}
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          background: 'none',
                          color: 'var(--design-ink3)',
                          border: '1px solid var(--design-border)',
                          borderRadius: 3,
                          cursor: 'pointer',
                        }}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingSlug(slug)}
                      title="Remove section"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--design-ink3)',
                        fontSize: 16,
                        lineHeight: 1,
                        padding: '2px 4px',
                        borderRadius: 3,
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {error && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--design-border)', flexShrink: 0 }}>
        <button
          onClick={onOpenAdd}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'none',
            border: '1px dashed var(--design-border)',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--design-ink3)',
            fontWeight: 500,
          }}
        >
          + Add Section
        </button>
      </div>
    </div>
  )
}
