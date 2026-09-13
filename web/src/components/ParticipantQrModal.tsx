import { useEffect, useState, useCallback } from 'react'
import { Printer, RefreshCw, ShieldOff, ShieldCheck, AlertTriangle } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'

import { Button, Modal } from './ui'
import type { Event, EventParticipantToken } from '../lib/types'
import { api } from '../lib/api'

type TokenMap = Record<number, EventParticipantToken> // keyed by student_id

export function ParticipantQrModal({
  event,
  studentId,      // null = show all
  onClose,
}: {
  event: Event
  studentId: number | null
  onClose: () => void
}) {
  const [tokens, setTokens] = useState<EventParticipantToken[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [batchMode, setBatchMode] = useState(studentId === null)
  const [actionPending, setActionPending] = useState<number | null>(null) // tokenId

  // Generate / fetch tokens on mount
  const fetchTokens = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.post<{ tokens: EventParticipantToken[] }>(`/admin/events/${event.id}/tokens`)
      setTokens(data.tokens ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tokens')
    } finally {
      setLoading(false)
    }
  }, [event.id])

  useEffect(() => { fetchTokens() }, [fetchTokens])

  const tokenMap: TokenMap = {}
  for (const t of tokens) tokenMap[t.student_id] = t

  const list = batchMode
    ? tokens
    : studentId != null && tokenMap[studentId]
      ? [tokenMap[studentId]]
      : tokens

  const activeList = list.filter(t => !t.is_revoked)
  const revokedList = list.filter(t => t.is_revoked)

  async function handleRevoke(tokenId: number) {
    setActionPending(tokenId)
    try {
      await api.post(`/admin/events/${event.id}/tokens/${tokenId}/revoke`)
      await fetchTokens()
    } finally {
      setActionPending(null)
    }
  }

  async function handleReissue(tokenId: number) {
    setActionPending(tokenId)
    try {
      await api.post(`/admin/events/${event.id}/tokens/${tokenId}/reissue`)
      await fetchTokens()
    } finally {
      setActionPending(null)
    }
  }

  function handlePrint() {
    window.print()
  }

  const title = batchMode
    ? `QR Passes — ${event.name} (${activeList.length} active)`
    : list[0]
      ? `QR Pass: ${list[0].last_name}, ${list[0].first_name}`
      : 'QR Pass'

  return (
    <Modal title={title} onClose={onClose} wide>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .printable-qr-container, .printable-qr-container * { visibility: visible !important; }
          .printable-qr-container {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important;
            padding: 20px !important;
            background: #ffffff !important;
          }
          .no-print { display: none !important; }
          .qr-card { break-inside: avoid !important; page-break-inside: avoid !important; }
        }
      `}</style>

      {/* Controls */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {tokens.length > 1 && studentId !== null && (
            <div className="segmented" role="group">
              <button type="button" className={!batchMode ? 'active' : ''} onClick={() => setBatchMode(false)}>
                Single Pass
              </button>
              <button type="button" className={batchMode ? 'active' : ''} onClick={() => setBatchMode(true)}>
                All Passes ({tokens.length})
              </button>
            </div>
          )}
          {revokedList.length > 0 && (
            <span style={{ fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <AlertTriangle size={13} /> {revokedList.length} revoked
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={fetchTokens} disabled={loading}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
          </Button>
          <Button onClick={handlePrint} disabled={loading || activeList.length === 0}>
            <Printer size={16} /> Print {batchMode ? `All ${activeList.length}` : ''} Pass{activeList.length !== 1 ? 'es' : ''}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="no-print" style={{ color: '#dc2626', marginBottom: '1rem', padding: '0.75rem', background: '#fef2f2', borderRadius: '6px' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
          Generating QR tokens…
        </div>
      )}

      {/* Cards */}
      {!loading && (
        <div className="printable-qr-container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: batchMode ? 'repeat(auto-fill, minmax(260px, 1fr))' : '1fr',
              gap: '1.25rem',
              justifyItems: 'center',
            }}
          >
            {list.map((t) => (
              <div
                key={t.token_id}
                className="qr-card"
                style={{
                  width: batchMode ? '260px' : '340px',
                  border: t.is_revoked ? '2px solid #dc2626' : '2px solid #0284c7',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  textAlign: 'center',
                  background: t.is_revoked ? '#fff5f5' : '#ffffff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  margin: batchMode ? '0' : '0 auto',
                  opacity: t.is_revoked ? 0.7 : 1,
                  position: 'relative',
                }}
              >
                {/* Revoked badge */}
                {t.is_revoked && (
                  <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: '#dc2626', color: '#fff', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                    REVOKED
                  </div>
                )}

                {/* Header */}
                <div style={{ background: t.is_revoked ? '#dc2626' : '#0284c7', color: '#ffffff', padding: '0.5rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9, display: 'block' }}>
                    SSC Event Pass
                  </span>
                  <strong style={{ fontSize: '0.95rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {event.name}
                  </strong>
                </div>

                {/* QR — UUID token as value */}
                <div style={{ display: 'inline-block', padding: '0.75rem', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '0.85rem', filter: t.is_revoked ? 'grayscale(1)' : undefined }}>
                  <QRCodeCanvas
                    value={t.token}
                    size={batchMode ? 140 : 180}
                    level="H"
                  />
                </div>

                {/* Student info */}
                <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem', color: '#0f172a' }}>
                  {t.last_name}, {t.first_name}
                </h4>
                <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.82rem', fontWeight: 600, color: '#0284c7', fontFamily: 'monospace' }}>
                  ID: {t.student_id_code ?? '—'}
                </p>
                <div style={{ fontSize: '0.73rem', color: '#64748b', borderTop: '1px dashed #e2e8f0', paddingTop: '0.4rem', marginBottom: '0.6rem' }}>
                  <span>{t.course || 'Course'}{t.year_level ? ` Yr ${t.year_level}` : ''}</span>
                  {t.section ? <span> • Sec {t.section}</span> : null}
                </div>

                {/* Token meta (no-print) */}
                <div className="no-print" style={{ fontSize: '0.68rem', color: '#94a3b8', marginBottom: '0.5rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {t.token}
                </div>

                {/* Revoke / Reissue actions (no-print) */}
                <div className="no-print" style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                  {t.is_revoked ? (
                    <button
                      type="button"
                      disabled={actionPending === t.token_id}
                      onClick={() => handleReissue(t.token_id)}
                      style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid #16a34a', color: '#16a34a', background: 'transparent', cursor: 'pointer' }}
                    >
                      <ShieldCheck size={12} /> Re-issue
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={actionPending === t.token_id}
                      onClick={() => handleRevoke(t.token_id)}
                      style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid #dc2626', color: '#dc2626', background: 'transparent', cursor: 'pointer' }}
                    >
                      <ShieldOff size={12} /> Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}

            {list.length === 0 && !loading && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                No participants found for this event. Add participants first.
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
