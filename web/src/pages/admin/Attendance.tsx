import { useEffect, useState } from 'react'
import { Download, Pencil, Trash2 } from 'lucide-react'

import { Button, EmptyState, Field, FormActions, Modal, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDateShort, fmtDateTime, fmtTime } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { AttendanceLog, AttendanceQuery, Event, SessionWindow } from '../../lib/types'

export function AdminAttendance() {
  const { toast } = useToast()
  const [events, setEvents] = useState<Event[]>([])
  const [rows, setRows] = useState<AttendanceLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AttendanceQuery>({})
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<AttendanceLog | null>(null)
  const [exporting, setExporting] = useState(false)

  const selected = events.find((e) => e.id === filter.event_id)
  const windows: SessionWindow[] = selected?.session_windows ?? []

  async function load() {
    try {
      const list = await api.get<AttendanceLog[]>('/admin/attendance', {
        event_id: filter.event_id,
        date: filter.date,
        session_window_id: filter.session_window_id,
        status: filter.status,
        q: filter.q,
        limit: 500,
      })
      setRows(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attendance')
    }
  }

  useEffect(() => {
    void api.get<Event[]>('/admin/events').then(setEvents).catch(() => undefined)
  }, [])

  useEffect(() => {
    void load()
  }, [filter.event_id, filter.date, filter.session_window_id, filter.status, filter.q])

  async function remove(log: AttendanceLog) {
    if (
      !window.confirm(
        `${log.student_name ?? 'Student'} — ${log.session_label ?? ''} ${log.direction} at ${fmtTime(log.scanned_at)}.\n\nDeleting an IN allows the student to be scanned IN again.`,
      )
    ) {
      return
    }
    try {
      await api.delete(`/admin/attendance/${log.id}`)
      toast('Record deleted')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const csv = await api.getText('/admin/attendance/export', {
        event_id: filter.event_id,
        date: filter.date,
        session_window_id: filter.session_window_id,
        status: filter.status,
        q: filter.q,
      })
      await navigator.clipboard.writeText(csv)
      const lines = csv.trim().split('\n').length - 1
      toast(`CSV copied (${lines} rows)`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Attendance records</h2>
          <p>Filter, correct, delete, export CSV</p>
        </div>
        <Button variant="secondary" onClick={() => void exportCsv()} disabled={exporting}>
          <Download size={16} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>
      <div className="card filters">
        <div className="grid-2">
          <Field label="Event">
            <select
              value={filter.event_id ?? ''}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  event_id: e.target.value ? Number(e.target.value) : undefined,
                  session_window_id: undefined,
                }))
              }
            >
              <option value="">All events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Session">
            <select
              value={filter.session_window_id ?? ''}
              disabled={windows.length === 0}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  session_window_id: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
            >
              <option value="">All</option>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.session_label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Student name / code">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setFilter((f) => ({ ...f, q: search.trim() || undefined }))
              }}
            />
          </Field>
          <Field label="Date">
            <div className="row">
              <input
                type="date"
                value={filter.date ?? ''}
                onChange={(e) => setFilter((f) => ({ ...f, date: e.target.value || undefined }))}
              />
              {filter.date ? (
                <Button variant="ghost" className="btn-sm" onClick={() => setFilter((f) => ({ ...f, date: undefined }))}>
                  Clear {fmtDateShort(filter.date)}
                </Button>
              ) : null}
            </div>
          </Field>
        </div>
        <div className="row filters-status">
          <span className="muted">Status</span>
          <div className="segmented">
            {(['all', 'confirmed', 'cancelled'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={(filter.status ?? 'all') === s ? 'active' : ''}
                onClick={() => setFilter((f) => ({ ...f, status: s === 'all' ? undefined : s }))}
              >
                {s[0]!.toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {rows === null && !error ? (
        <p className="loading">Loading records…</p>
      ) : rows && rows.length === 0 ? (
        <EmptyState title="No records match" />
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Dir</th>
                  <th>Student</th>
                  <th>Session</th>
                  <th>When</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className={`dir ${log.direction.toLowerCase()}`}>{log.direction}</span>
                    </td>
                    <td className={log.status === 'cancelled' ? 'struck' : ''}>
                      <strong>{log.student_name ?? `Student #${log.student_id}`}</strong>
                      <div className="muted">
                        {[log.student_id_code, log.event_name, log.status === 'cancelled' ? 'CANCELLED' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td>{log.session_label ?? `Session #${log.session_window_id}`}</td>
                    <td>{fmtDateTime(log.scanned_at)}</td>
                    <td className="muted">{log.scanned_by_name ?? '—'}</td>
                    <td>
                      <div className="menu end">
                        <button className="icon-btn" title="Edit" onClick={() => setEditing(log)}>
                          <Pencil size={16} />
                        </button>
                        <button className="icon-btn" title="Delete" onClick={() => void remove(log)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows ? (
            <p className="muted table-meta">
              {rows.length} record{rows.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      )}
      {editing ? (
        <EditAttendance
          log={editing}
          windows={windows}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      ) : null}
    </>
  )
}

function EditAttendance({
  log,
  windows,
  onClose,
  onSaved,
}: {
  log: AttendanceLog
  windows: SessionWindow[]
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [direction, setDirection] = useState(log.direction)
  const [status, setStatus] = useState(log.status)
  const [windowId, setWindowId] = useState(log.session_window_id)
  const [scannedAt, setScannedAt] = useState(toLocalInput(log.scanned_at))
  const [note, setNote] = useState(log.device_note ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api.put(`/admin/attendance/${log.id}`, {
        direction,
        status,
        session_window_id: windowId,
        scanned_at: new Date(scannedAt).toISOString(),
        device_note: note.trim(),
      })
      toast('Record updated')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Update failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit attendance" onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit(save)}>
        <p>
          <strong>{log.student_name}</strong>
          <span className="muted"> · {log.student_id_code}</span>
        </p>
        <div className="grid-2">
          <Field label="Direction">
            <select value={direction} onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as 'confirmed' | 'cancelled')}>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        </div>
        {windows.length > 0 ? (
          <Field label="Session">
            <select value={windowId} onChange={(e) => setWindowId(Number(e.target.value))}>
              {windows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.session_label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Scanned at">
          <input type="datetime-local" value={scannedAt} onChange={(e) => setScannedAt(e.target.value)} />
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormActions onCancel={onClose} submitLabel="Save" busy={busy} />
      </form>
    </Modal>
  )
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
