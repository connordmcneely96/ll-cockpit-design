"use client"

import { useState, useEffect } from "react"

type SectionType = {
  id: string
  name: string
  description: string
  category: string
}

type Props = {
  briefId: string
  open: boolean
  onClose: () => void
  onAdded: () => void
}

export default function AddSectionModal({ briefId, open, onClose, onAdded }: Props) {
  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setFetchError(null)
    loadSectionTypes()
  }, [open])

  async function loadSectionTypes() {
    setLoading(true)
    try {
      const res = await fetch('/api/design/section-types')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { section_types: SectionType[] }
      setSectionTypes(data.section_types ?? [])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load section types')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(st: SectionType) {
    onClose()
    const message = `Use the add_section tool with name="${st.name}" and description="${st.description}". After adding, call save_iteration to commit the change. Do not modify any existing sections.`
    try {
      const res = await fetch(`/api/design/briefs/${briefId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onAdded()
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add section')
    }
  }

  const errorBanner = addError ? (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#fee2e2',
        color: '#991b1b',
        border: '1px solid #fca5a5',
        borderRadius: 6,
        padding: '8px 16px',
        fontSize: 13,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      {addError}
      <button
        onClick={() => setAddError(null)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  ) : null

  if (!open) return errorBanner

  const categories = Array.from(new Set(sectionTypes.map(st => st.category)))

  return (
    <>
      {errorBanner}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          style={{
            background: 'var(--design-bg, #fff)',
            borderRadius: 10,
            width: '100%',
            maxWidth: 520,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '14px 16px',
              borderBottom: '1px solid var(--design-border)',
              flexShrink: 0,
            }}
          >
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--design-ink)' }}>
              Add a section
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 20,
                color: 'var(--design-ink3)',
                lineHeight: 1,
                padding: '2px 4px',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 40,
                  gap: 8,
                  color: 'var(--design-ink3)',
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    border: '2px solid var(--design-border)',
                    borderTopColor: 'var(--design-terracotta)',
                    animation: 'spin 0.9s linear infinite',
                    flexShrink: 0,
                  }}
                />
                Loading section types…
              </div>
            ) : fetchError ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>{fetchError}</div>
                <button
                  onClick={loadSectionTypes}
                  style={{
                    fontSize: 12,
                    padding: '6px 14px',
                    background: 'var(--design-terracotta)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 5,
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              categories.map(cat => (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--design-ink3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: 8,
                    }}
                  >
                    {cat}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {sectionTypes.filter(st => st.category === cat).map(st => (
                      <button
                        key={st.id}
                        onClick={() => handleSelect(st)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          border: '1px solid var(--design-border)',
                          borderRadius: 7,
                          cursor: 'pointer',
                          background: 'var(--design-bg)',
                        }}
                        onMouseEnter={e => {
                          const el = e.currentTarget
                          el.style.borderColor = 'var(--design-terracotta)'
                          el.style.background = '#fef3f2'
                        }}
                        onMouseLeave={e => {
                          const el = e.currentTarget
                          el.style.borderColor = 'var(--design-border)'
                          el.style.background = 'var(--design-bg)'
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--design-ink)', marginBottom: 3 }}>
                          {st.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--design-ink3)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {st.description}
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 10,
                            fontWeight: 500,
                            color: 'var(--design-terracotta)',
                            background: '#fef3f2',
                            borderRadius: 999,
                            padding: '1px 6px',
                            display: 'inline-block',
                          }}
                        >
                          {st.category}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}
