import { useEffect, useId, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { Keyboard, QrCode } from 'lucide-react'

import { Button, Modal } from '../../components/ui'
import { api } from '../../lib/api'
import { cameraBlockedReason, explainCameraFailure, pickCameraId } from '../../lib/camera'
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
      toast(
        `${preview.student.full_name} — ${preview.computed_direction}${preview.is_late ? ' (late)' : ''}`,
      )
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
            <p className="error-text" style={{ marginTop: 8 }}>
              {cameraError}
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
  const color = blocked
    ? 'var(--blocked)'
    : preview.is_late
      ? 'var(--late)'
      : preview.computed_direction === 'IN'
        ? 'var(--in)'
        : 'var(--out)'
  const label = blocked
    ? 'DONE'
    : preview.is_late
      ? `${preview.computed_direction} (LATE)`
      : preview.computed_direction
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
            : [
                preview.message,
                `${preview.computed_session.mode === 'manual' ? 'Manual session' : 'Auto session'} · ${fmtRange(preview.computed_session.start_time, preview.computed_session.end_time)} · server ${fmtTime(preview.server_time)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
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
              Confirm {preview.is_late ? `${preview.computed_direction} (late)` : preview.computed_direction}
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
  const reactId = useId()
  const hostId = `qr-reader-${reactId.replace(/:/g, '')}`
  const pausedRef = useRef(paused)
  const onCodeRef = useRef(onCode)
  const onErrorRef = useRef(onError)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [retry, setRetry] = useState(0)
  const [needsGesture, setNeedsGesture] = useState(false)

  useEffect(() => {
    pausedRef.current = paused
    onCodeRef.current = onCode
    onErrorRef.current = onError
  }, [paused, onCode, onError])

  useEffect(() => {
    let cancelled = false
    let instance: Html5Qrcode | undefined

    async function stop(scanner?: Html5Qrcode) {
      if (!scanner) return
      try {
        if (scanner.isScanning) await scanner.stop()
        scanner.clear()
      } catch {
        /* already stopped */
      }
    }

    async function start() {
      const blocked = cameraBlockedReason()
      if (blocked) {
        onErrorRef.current(blocked)
        setNeedsGesture(false)
        return
      }
      const { Html5Qrcode } = await import('html5-qrcode')
      if (cancelled) return
      const host = document.getElementById(hostId)
      if (!host) return
      host.replaceChildren()
      instance = new Html5Qrcode(hostId, { verbose: false })
      scannerRef.current = instance
      const config = {
        fps: 10,
        qrbox: (width: number, height: number) => {
          const size = Math.max(120, Math.floor(Math.min(width, height) * 0.72))
          return { width: size, height: size }
        },
      }
      const onDecoded = (decoded: string) => {
        if (!pausedRef.current) onCodeRef.current(decoded)
      }
      const cameras = await Html5Qrcode.getCameras().catch(() => [])
      if (cancelled) return
      const cameraId = pickCameraId(cameras)
      try {
        if (cameraId) {
          await instance.start(cameraId, config, onDecoded, () => undefined)
        } else {
          try {
            await instance.start({ facingMode: 'environment' }, config, onDecoded, () => undefined)
          } catch {
            await instance.start({ facingMode: 'user' }, config, onDecoded, () => undefined)
          }
        }
      } catch (e) {
        if (cancelled) return
        onErrorRef.current(explainCameraFailure(e))
        setNeedsGesture(true)
        await stop(instance)
        scannerRef.current = null
        return
      }
      if (cancelled) {
        await stop(instance)
        return
      }
      onErrorRef.current(null)
      setNeedsGesture(false)
    }

    void start()
    return () => {
      cancelled = true
      scannerRef.current = null
      void stop(instance)
    }
  }, [hostId, retry])

  useEffect(() => {
    const scanner = scannerRef.current
    if (!scanner?.isScanning) return
    try {
      if (paused) scanner.pause(true)
      else scanner.resume()
    } catch {
      /* not scanning yet */
    }
  }, [paused])

  return (
    <div>
      <div id={hostId} className="qr-reader" />
      {needsGesture ? (
        <Button
          style={{ marginTop: 10, width: '100%' }}
          onClick={() => {
            setNeedsGesture(false)
            setRetry((n) => n + 1)
          }}
        >
          Turn on camera
        </Button>
      ) : null}
    </div>
  )
}
