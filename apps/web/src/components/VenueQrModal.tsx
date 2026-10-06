import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Clock, LogIn, LogOut, Maximize2, Minimize2, RefreshCw, ShieldOff, Zap } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'

import { api, getToken } from '../lib/api'
import type { VenueQrTokenResponse } from '../lib/types'
import { Button, Modal } from './ui'

interface VenueQrModalProps {
  eventId: number
  eventName: string
  sessionWindowId: number
  sessionLabel: string
  onClose: () => void
}

export function VenueQrModal({
  eventName,
  sessionWindowId,
  sessionLabel,
  onClose,
}: VenueQrModalProps) {
  const [actionCode, setActionCode] = useState<'IN' | 'OUT'>('IN')
  const [validForSeconds, setValidForSeconds] = useState<number>(0)
  const [token, setToken] = useState<VenueQrTokenResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [revoked, setRevoked] = useState<boolean>(false)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0)
  const [fullscreen, setFullscreen] = useState<boolean>(false)
  const [lastScanNotice, setLastScanNotice] = useState<string | null>(null)

  const fetchQrToken = useCallback(async () => {
    setLoading(true)
    setError(null)
    setRevoked(false)
    try {
      const data = await api.post<VenueQrTokenResponse>(
        `/admin/event-sessions/${sessionWindowId}/qr-tokens`,
        {
          actionCode,
          validForSeconds: validForSeconds === 0 ? 3600 : validForSeconds,
          overlapSeconds: 5,
        },
      )
      setToken(data)

      const expires = new Date(data.expiresAtUtc).getTime()
      const now = Date.now()
      const diffSec = Math.max(0, Math.floor((expires - now) / 1000))
      setRemainingSeconds(diffSec)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to issue venue QR token')
    } finally {
      setLoading(false)
    }
  }, [sessionWindowId, actionCode, validForSeconds])

  const fetchQrTokenRef = useRef(fetchQrToken)
  useEffect(() => {
    fetchQrTokenRef.current = fetchQrToken
  }, [fetchQrToken])

  useEffect(() => {
    fetchQrToken()
  }, [fetchQrToken])

  const [sseConnected, setSseConnected] = useState<boolean>(false)

  // Real-time SSE listener for instant QR rotation on student scan
  useEffect(() => {
    const authToken = getToken()
    if (!sessionWindowId || !authToken) return

    const url = `/api/v1/attendance/event-qr/stream?session_window_id=${sessionWindowId}&token=${encodeURIComponent(authToken)}`
    const es = new EventSource(url)

    es.onopen = () => {
      setSseConnected(true)
    }

    es.addEventListener('qr_scanned', (ev) => {
      try {
        const data = JSON.parse(ev.data) as { scanResultCode?: string; studentFullName?: string; studentNumber?: string }
        const name = data.studentFullName || data.studentNumber || 'Student'
        if (data.scanResultCode === 'ACCEPTED') {
          setLastScanNotice(`Scan Accepted: ${name} — Instantly Rotated!`)
          void fetchQrTokenRef.current()
        } else if (data.scanResultCode === 'NO_CHANGE') {
          setLastScanNotice(`Already Recorded: ${name} (QR Unchanged)`)
        } else {
          setLastScanNotice(`Scan Processed: ${name}`)
        }

        setTimeout(() => setLastScanNotice(null), 4000)
      } catch {
        /* ignore parse errors */
      }
    })

    es.onerror = (err) => {
      setSseConnected(false)
      console.warn('[SSE] EventSource stream error:', err)
    }

    return () => {
      es.close()
    }
  }, [sessionWindowId])

  // Countdown and auto-refresh timer (skipped when validForSeconds === 0)
  useEffect(() => {
    if (!token || revoked || validForSeconds === 0) return

    const interval = setInterval(() => {
      const expires = new Date(token.expiresAtUtc).getTime()
      const now = Date.now()
      const diffSec = Math.floor((expires - now) / 1000)

      if (diffSec <= 0) {
        // Token expired -> issue next token automatically
        fetchQrTokenRef.current()
      } else {
        setRemainingSeconds(diffSec)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [token, revoked, validForSeconds])

  async function handleRevoke() {
    if (!token || revoked) return
    try {
      await api.post(`/admin/event-session-qr-tokens/${token.eventSessionQrTokenId}/revoke`, {
        reason: 'Revoked by admin from Venue QR screen',
      })
      setRevoked(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke token')
    }
  }

  const progressPercent = Math.max(
    0,
    Math.min(100, (remainingSeconds / validForSeconds) * 100),
  )

  return (
    <Modal
      title={`Venue QR — ${eventName}`}
      onClose={onClose}
      wide
    >
      <div className={`venue-qr-container ${fullscreen ? 'is-fullscreen' : ''}`}>
        <style>{`
          .venue-qr-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.25rem;
            padding: 0.5rem 0;
          }
          .venue-qr-container.is-fullscreen {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: #0f172a;
            color: #ffffff;
            padding: 2rem;
            justify-content: center;
          }
          .venue-qr-header {
            text-align: center;
          }
          .venue-qr-header h3 {
            margin: 0;
            font-size: 1.35rem;
            font-weight: 700;
          }
          .venue-qr-subtitle {
            color: #64748b;
            font-size: 0.9rem;
            margin-top: 0.25rem;
          }
          .is-fullscreen .venue-qr-subtitle {
            color: #94a3b8;
          }
          .venue-qr-controls {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            justify-content: center;
            align-items: center;
          }
          .btn-group-toggle {
            display: inline-flex;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #cbd5e1;
          }
          .btn-group-toggle button {
            padding: 0.4rem 0.85rem;
            font-size: 0.85rem;
            font-weight: 600;
            border: none;
            background: #f8fafc;
            color: #475569;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.35rem;
            transition: all 0.15s ease;
          }
          .btn-group-toggle button.active-in {
            background: #10b981;
            color: #ffffff;
          }
          .btn-group-toggle button.active-out {
            background: #f59e0b;
            color: #ffffff;
          }
          .venue-qr-card {
            background: #ffffff;
            border-radius: 16px;
            padding: 1.75rem;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column;
            align-items: center;
            border: 2px solid #e2e8f0;
            position: relative;
          }
          .is-fullscreen .venue-qr-card {
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          }
          .venue-qr-timer-bar {
            width: 100%;
            height: 6px;
            background: #e2e8f0;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 1.25rem;
          }
          .venue-qr-timer-fill {
            height: 100%;
            transition: width 1s linear;
          }
          .venue-qr-badge {
            margin-top: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.85rem;
            font-weight: 600;
          }
          .venue-qr-badge.in { color: #059669; }
          .venue-qr-badge.out { color: #d97706; }
          .venue-qr-instructions {
            text-align: center;
            max-width: 420px;
            font-size: 0.85rem;
            color: #64748b;
            line-height: 1.4;
          }
          .is-fullscreen .venue-qr-instructions {
            color: #cbd5e1;
          }
        `}</style>

        <div className="venue-qr-header">
          <h3>
            {sessionLabel}
            {sseConnected ? (
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  marginLeft: 8,
                  boxShadow: '0 0 8px #10b981',
                }}
                title="Live SSE Connected"
              />
            ) : null}
          </h3>
          <div className="venue-qr-subtitle">{eventName}</div>
        </div>

        {lastScanNotice ? (
          <div
            className="alert alert-success"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.9rem',
              animation: 'pulse 0.5s ease-in-out',
            }}
          >
            <Zap size={18} style={{ color: '#10b981' }} />
            <span>{lastScanNotice}</span>
          </div>
        ) : null}

        <div className="venue-qr-controls no-print">
          <div className="btn-group-toggle" role="radiogroup" aria-label="Scan direction">
            <button
              type="button"
              className={actionCode === 'IN' ? 'active-in' : ''}
              onClick={() => setActionCode('IN')}
            >
              <LogIn size={15} /> Check-In (IN)
            </button>
            <button
              type="button"
              className={actionCode === 'OUT' ? 'active-out' : ''}
              onClick={() => setActionCode('OUT')}
            >
              <LogOut size={15} /> Check-Out (OUT)
            </button>
          </div>

          <select
            className="form-control"
            style={{ width: 'auto', fontSize: '0.85rem', padding: '0.35rem 0.65rem' }}
            value={validForSeconds}
            onChange={(e) => setValidForSeconds(Number(e.target.value))}
          >
            <option value={0}>Rotate on scan only (No timer)</option>
            <option value={15}>Rotate every 15s</option>
            <option value={30}>Rotate every 30s</option>
            <option value={60}>Rotate every 60s</option>
            <option value={120}>Rotate every 2m</option>
            <option value={300}>Rotate every 5m</option>
          </select>

          <Button
            variant="secondary"
            onClick={fetchQrToken}
            disabled={loading}
            title="Refresh Token Now"
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </Button>

          <Button
            variant="secondary"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? 'Exit Fullscreen' : 'Fullscreen Display Mode'}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </Button>
        </div>

        {error ? (
          <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        ) : loading && !token ? (
          <div className="venue-qr-card" style={{ width: 280, height: 280, justifyContent: 'center' }}>
            <RefreshCw size={36} className="spin" style={{ color: '#3b82f6' }} />
            <span style={{ marginTop: '1rem', color: '#64748b' }}>Generating QR token...</span>
          </div>
        ) : revoked ? (
          <div className="venue-qr-card" style={{ width: 280, height: 280, justifyContent: 'center' }}>
            <ShieldOff size={48} style={{ color: '#ef4444' }} />
            <strong style={{ marginTop: '0.75rem', color: '#ef4444' }}>QR Token Revoked</strong>
            <Button variant="secondary" style={{ marginTop: '1rem' }} onClick={fetchQrToken}>
              Issue New Token
            </Button>
          </div>
        ) : token ? (
          <div className="venue-qr-card">
            <QRCodeCanvas
              value={token.qrValue}
              size={fullscreen ? 360 : 260}
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#0f172a"
            />

            <div className={`venue-qr-badge ${actionCode === 'IN' ? 'in' : 'out'}`}>
              {actionCode === 'IN' ? <LogIn size={16} /> : <LogOut size={16} />}
              <span>
                {actionCode === 'IN' ? 'CHECK-IN' : 'CHECK-OUT'} MODE
              </span>
            </div>

            <div className="venue-qr-timer-bar">
              <div
                className="venue-qr-timer-fill"
                style={{
                  width: validForSeconds === 0 ? '100%' : `${progressPercent}%`,
                  backgroundColor: actionCode === 'IN' ? '#10b981' : '#f59e0b',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                marginTop: '0.5rem',
                fontSize: '0.8rem',
                color: '#64748b',
              }}
            >
              <Clock size={13} />
              <span>{validForSeconds === 0 ? 'Rotates on student scan (Timer disabled)' : `Rotates in ${remainingSeconds}s`}</span>
            </div>
          </div>
        ) : null}

        <div className="venue-qr-instructions">
          Students can scan this Venue QR code using the <strong>CUEare Mobile App</strong> to record their attendance self-scan.
        </div>

        {token && !revoked && (
          <div className="no-print" style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn-link"
              style={{ color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer', border: 'none', background: 'none' }}
              onClick={handleRevoke}
            >
              <ShieldOff size={13} style={{ verticalAlign: 'middle', marginRight: '0.2rem' }} />
              Revoke this QR token
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
