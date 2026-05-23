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
  const [reordering, setReordering] = useState(false)
  const [draggingSlug, setDraggingSlug] = useState<string | null>(null)
  const [dragOverSlug, setDragOverSlug] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null)

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

  function handleDragStart(e: DragEvent & { currentTarget: HTMLElement }, slug: string) {
    setDraggingSlug(slug)
    e.dataTransfer!.effectAllowed = 'move'
  }

  function handleDragOver(e: DragEvent & { currentTarget: HTMLElement }, slug: string) {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    if (slug === draggingSlug) {
      setDragOverSlug(null)
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDragOverSlug(slug)
    setDragOverPosition(e.clientY < rect.top + rect.height / 2 ? 'above' : 'below')
  }

  function handleDragEnd() {
    setDraggingSlug(null)
    setDragOverSlug(null)
    setDragOverPosition(null)
  }

  async function handleDrop(e: DragEvent & { currentTarget: HTMLElement }, targetSlug: string) {
    e.preventDefault()
    const fromSlug = draggingSlug
    setDraggingSlug(null)
    setDragOverSlug(null)
    setDragOverPosition(null)

    if (!fromSlug || fromSlug === targetSlug) return

    const slugs = sections.map(s => s.slug)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const insertAfter = e.clientY >= rect.top + rect.height / 2

    const newOrder = slugs.filter(s => s !== fromSlug)
    const insertAt = newOrder.indexOf(targetSlug) + (insertAfter ? 1 : 0)
    newOrder.splice(insertAt, 0, fromSlug)

    setReordering(true)
    const message = `Use the reorder_sections tool with ordered_slugs=${JSON.stringify(newOrder)}. After reordering, call save_iteration to commit the change. Do not modify the content of any section.`

    try {
      const res = await fetch(`/api/design/briefs/${briefId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onSectionAction()
    } catch (err) {
      setRowErrors({ ...rowErrors, [fromSlug]: err instanceof Error ? err.message : 'Reorder failed' })
    } finally {
      setReordering(false)
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
          <>
            {sections.map(({ name, slug }) => {
              const isRemoving = removingSlug === slug
              const isConfirming = confirmingSlug === slug
              const isDragging = draggingSlug === slug
              const isDragOver = dragOverSlug === slug
              const error = rowErrors[slug]

              return (
                <div key={slug}>
                  {isDragOver && dragOverPosition === 'above' && (
                    <div
                      style={{
                        height: 2,
                        background: 'var(--design-primary, #00d4ff)',
                        margin: '0 12px',
                        borderRadius: 1,
                      }}
                    />
                  )}
                  <div
                    draggable={!isRemoving && !reordering}
                    onDragStart={(e) => handleDragStart(e as unknown as DragEvent & { currentTarget: HTMLElement }, slug)}
                    onDragOver={(e) => handleDragOver(e as unknown as DragEvent & { currentTarget: HTMLElement }, slug)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e as unknown as DragEvent & { currentTarget: HTMLElement }, slug)}
                    style={{
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--design-border)',
                      opacity: isRemoving || isDragging ? 0.4 : 1,
                      pointerEvents: isRemoving ? 'none' : 'auto',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        title="Drag to reorder"
                        style={{
                          fontSize: 14,
                          color: 'var(--design-ink3)',
                          cursor: reordering ? 'not-allowed' : 'grab',
                          userSelect: 'none',
                          flexShrink: 0,
                          lineHeight: 1,
                        }}
                      >
                        ≡
                      </span>

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
                  {isDragOver && dragOverPosition === 'below' && (
                    <div
                      style={{
                        height: 2,
                        background: 'var(--design-primary, #00d4ff)',
                        margin: '0 12px',
                        borderRadius: 1,
                      }}
                    />
                  )}
                </div>
              )
            })}
            {reordering && (
              <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--design-ink3)', textAlign: 'center' }}>
                Reordering…
              </div>
            )}
          </>
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
