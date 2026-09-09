import { useEffect, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { Keyboard, QrCode } from 'lucide-react'

import { Button, Modal } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtRange, fmtTime, initial } from '../../lib/format'
import { useModerator } from '../../lib/moderator'
import { useToast } from '../../lib/toast'
import type { AttendanceLog, ScanPreview } from '../../lib/types'
import { SessionOverride } from './SessionOverride'

export function ModeratorScan() {
  const { toast } = useToast()
  const { selected, override, reload } = useModerator()
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ScanPreview | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(0)
  const lastCode = useRef<{ code: string; at: number } | null>(null)

  async function previewCode(raw: string) {
    const code = raw.trim()
    if (!code || !selected || busy) return
    const now = Date.now()
    if (lastCode.current && lastCode.current.code === code && now - lastCode.current.at < 2500) {
      return
    }
    lastCode.current = { code, at: now }
    setBusy(true)
    try {
      const p = await api.post<ScanPreview>('/moderator/scan/preview', {
        event_id: selected.id,
        student_id_code: code,
        ...(override != null ? { session_window_id: override } : {}),
      })
      setPreview(p)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scan failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!preview || !preview.can_confirm) return
    setBusy(true)
    try {
      await api.post<AttendanceLog>('/moderator/scan/confirm', {
        event_id: preview.event.id,
        student_id: preview.student.id,
        session_window_id: preview.computed_session.id,
        direction: preview.computed_direction,
        device_note: 'web',
      })
      setConfirmed((n) => n + 1)
      toast(`${preview.student.full_name} — ${preview.computed_direction}`)
      setPreview(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Confirm failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!preview) return
    setBusy(true)
    try {
      await api.post('/moderator/scan/cancel', {
        event_id: preview.event.id,
        student_id: preview.student.id,
        session_window_id: preview.computed_session.id,
        direction: preview.computed_direction === 'ALREADY_COMPLETE' ? 'IN' : preview.computed_direction,
      })
    } catch {
      /* cancel is best-effort */
    } finally {
      setBusy(false)
      setPreview(null)
    }
  }

  if (!selected) {
    return (
      <>
        <div className="page-head">
          <div>
            <h2>Scan</h2>
            <p>Pick an event on the home screen first</p>
          </div>
        </div>
        <p className="error-text">No event selected. Go back to Home and choose an active event.</p>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Scan</h2>
          <p>{selected.name}</p>
        </div>
        <span className="muted">{confirmed} confirmed</span>
      </div>
      <SessionOverride event={selected} />
      <div className="scan-stage" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <QrCode size={18} />
            <strong>Camera</strong>
          </div>
          <QrReader
            paused={Boolean(preview) || busy}
            onCode={(c) => void previewCode(c)}
            onError={setCameraError}
          />
          {cameraError ? (
            <p className="muted" style={{ marginTop: 8 }}>
              {cameraError} On LAN HTTP, browsers often block the camera — type the student code
              instead.
            </p>
          ) : (
            <p className="muted" style={{ marginTop: 8 }}>
              Point the camera at a student QR code
            </p>
          )}
        </div>
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <Keyboard size={18} />
            <strong>Type student code</strong>
          </div>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault()
              void previewCode(manual)
              setManual('')
            }}
          >
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="STU-2026-0001"
              autoCapitalize="characters"
            />
            <Button type="submit" disabled={busy || !manual.trim()}>
              Look up
            </Button>
          </form>
        </div>
      </div>
      {preview ? (
        <PreviewModal
          preview={preview}
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={() => void cancel()}
        />
      ) : null}
      <button type="button" className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => void reload()}>
        Refresh event windows
      </button>
    </>
  )
}

function PreviewModal({
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  preview: ScanPreview
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const blocked = !preview.can_confirm
  const color = blocked ? 'var(--blocked)' : preview.computed_direction === 'IN' ? 'var(--in)' : 'var(--out)'
  const label = blocked ? 'DONE' : preview.computed_direction
  const s = preview.student

  return (
    <Modal title="Scan preview" onClose={onCancel}>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="avatar lg">{initial(s.full_name)}</div>
        <div>
          <h3>{s.full_name}</h3>
          <p className="muted">{[s.student_id_code, s.section].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="preview-banner" style={{ borderColor: color, color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
        <strong>
          {preview.computed_session.session_label} — {label}
        </strong>
        <p className="muted" style={{ marginTop: 6 }}>
          {blocked
            ? preview.message ||
              `Already timed IN & OUT for ${preview.computed_session.session_label}`
            : `${preview.computed_session.mode === 'manual' ? 'Manual session' : 'Auto session'} · ${fmtRange(preview.computed_session.start_time, preview.computed_session.end_time)} · server ${fmtTime(preview.server_time)}`}
        </p>
      </div>
      {preview.existing_scans.length > 0 ? (
        <div className="windows" style={{ marginTop: 12, justifyContent: 'center' }}>
          {preview.existing_scans.map((e, i) => (
            <span key={i} className={`chip ${e.direction === 'IN' ? 'chip-in' : 'chip-out'}`}>
              {e.direction}
            </span>
          ))}
        </div>
      ) : null}
      <div className="actions">
        {blocked ? (
          <Button onClick={onCancel} disabled={busy}>
            OK, back to scanning
          </Button>
        ) : (
          <>
            <Button variant="danger" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={busy}>
              Confirm {preview.computed_direction}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

function QrReader({
  paused,
  onCode,
  onError,
}: {
  paused: boolean
  onCode: (code: string) => void
  onError: (message: string | null) => void
}) {
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const onCodeRef = useRef(onCode)
  onCodeRef.current = onCode

  useEffect(() => {
    const el = document.getElementById('qr-reader')
    if (!el) return
    let cancelled = false
    let scanner: Html5Qrcode | undefined
    void import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (cancelled) return
      const instance = new Html5Qrcode('qr-reader')
      scanner = instance
      return instance
        .start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (!pausedRef.current) onCodeRef.current(decoded)
          },
          () => undefined,
        )
        .then(() => {
          if (cancelled) {
            return instance.stop().then(() => {
              instance.clear()
            })
          }
          onError(null)
        })
        .catch((e: unknown) => {
          if (!cancelled) onError(e instanceof Error ? e.message : 'Camera unavailable.')
        })
    })
    return () => {
      cancelled = true
      scanner
        ?.stop()
        .then(() => {
          scanner?.clear()
        })
        .catch(() => undefined)
    }
  }, [onError])

  return <div id="qr-reader" />
}
