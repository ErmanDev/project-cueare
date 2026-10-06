import { useEffect, useState } from 'react'
import { ArrowLeft, Calendar, CheckCircle2, Download, Filter, Pencil, Search, Trash2, UserCheck, Users } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { Button, EmptyState, Field, FormActions, Modal, TableSkeleton, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDateTime, fmtRange, fmtTime, fmtWeekday, fmtYearLevel } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { AttendanceLog, AttendanceQuery, Event, SessionWindow } from '../../lib/types'

export function AdminAttendance({ embedded = false, onChanged }: { embedded?: boolean; onChanged?: () => void } = {}) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const routeParams = useParams<{ eventId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()

  const routeEventId = routeParams.eventId ? Number(routeParams.eventId) : undefined
  const paramEventId = searchParams.get('event_id') ? Number(searchParams.get('event_id')) : undefined
  const initialEventId = routeEventId ?? paramEventId

  const [events, setEvents] = useState<Event[]>([])
  const [rows, setRows] = useState<AttendanceLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<AttendanceQuery>({
    event_id: initialEventId,
    session_window_id: searchParams.get('session_window_id') ? Number(searchParams.get('session_window_id')) : undefined,
    date: searchParams.get('date') || undefined,
    status: (searchParams.get('status') as 'confirmed' | 'cancelled' | undefined) || undefined,
    q: searchParams.get('q') || undefined,
  })
  const [search, setSearch] = useState(searchParams.get('q') || '')
  const [editing, setEditing] = useState<AttendanceLog | null>(null)
  const [exporting, setExporting] = useState(false)
  const [syncingRoster, setSyncingRoster] = useState(false)

  const effectiveEventId = routeEventId ?? filter.event_id
  const selected = events.find((e) => e.id === effectiveEventId)
  const windows: SessionWindow[] = selected?.session_windows ?? []

  async function load() {
    try {
      const list = await api.get<AttendanceLog[]>('/admin/attendance', {
        event_id: effectiveEventId,
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

  async function loadEvents() {
    try {
      const list = await api.get<Event[]>('/admin/events')
      setEvents(list)
    } catch {
      /* filter still works with an empty list */
    }
  }

  useEffect(() => {
    void loadEvents()
  }, [])

  useEffect(() => {
    if (routeEventId !== undefined && routeEventId !== filter.event_id) {
      setFilter((f) => ({ ...f, event_id: routeEventId, session_window_id: undefined }))
    }
  }, [routeEventId])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilter((f) => ({ ...f, q: search.trim() || undefined }))
    }, 350)
    return () => window.clearTimeout(t)
  }, [search])

  useEffect(() => {
    const params: Record<string, string> = {}
    if (!embedded && filter.event_id) params.event_id = String(filter.event_id)
    if (filter.session_window_id) params.session_window_id = String(filter.session_window_id)
    if (filter.date) params.date = filter.date
    if (filter.status) params.status = filter.status
    if (filter.q) params.q = filter.q
    setSearchParams(params, { replace: true })
  }, [filter, setSearchParams])

  useEffect(() => {
    void load()
  }, [effectiveEventId, filter.date, filter.session_window_id, filter.status, filter.q])

  function handleEventChange(idStr: string) {
    if (!idStr) {
      navigate('/superadmin/attendance')
    } else {
      navigate(`/superadmin/events/${idStr}/attendance`)
    }
  }

  async function syncRoster() {
    if (!effectiveEventId) return
    setSyncingRoster(true)
    try {
      const res = await api.post<{ participant_count: number }>(`/admin/events/${effectiveEventId}/participants/sync`, {})
      toast(`Synced roster! ${res.participant_count} registered participants`)
      await loadEvents()
      await load()
      onChanged?.()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Roster sync failed', 'error')
    } finally {
      setSyncingRoster(false)
    }
  }

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
      onChanged?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const csv = await api.getText('/admin/attendance/export', {
        event_id: effectiveEventId,
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
      {!embedded ? <>
      {/* Top Breadcrumb & Event Selection Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link to="/superadmin/events" className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}>
            <ArrowLeft size={16} /> All Events List
          </Link>
          {filter.event_id ? (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
              onClick={() => handleEventChange('')}
            >
              View Global Log
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Select Event:</span>
          <select
            className="filter-control"
            style={{ fontWeight: 600, minWidth: '220px' }}
            value={filter.event_id ?? ''}
            onChange={(e) => handleEventChange(e.target.value)}
          >
            <option value="">All Events (Global Log)</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} ({ev.event_start_date === ev.event_end_date
                  ? fmtWeekday(ev.event_start_date)
                  : `${fmtWeekday(ev.event_start_date)} - ${fmtWeekday(ev.event_end_date)}`})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="page-head">
        <div>
          <h2>{selected ? selected.name : 'All Events Attendance Records'}</h2>
          <p>{selected ? `Specific Event Attendance Dashboard • ${selected.event_start_date === selected.event_end_date ? fmtWeekday(selected.event_start_date) : `${fmtWeekday(selected.event_start_date)} - ${fmtWeekday(selected.event_end_date)}`}` : 'System-wide attendance logs for all events'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {selected ? (
            <Button variant="secondary" onClick={() => void syncRoster()} disabled={syncingRoster}>
              <UserCheck size={16} /> {syncingRoster ? 'Syncing…' : 'Sync Roster'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void exportCsv()} disabled={exporting}>
            <Download size={16} /> {exporting ? 'Exporting…' : 'Export scan log'}
          </Button>
        </div>
      </div>

      {selected ? (
        <div className="card" style={{ marginBottom: '1.25rem', padding: '1.25rem', background: '#f8fafc', borderLeft: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <span className={`chip ${selected.is_active ? 'chip-active' : 'chip-inactive'}`}>
                  {selected.is_active ? 'Active Event' : 'Inactive Event'}
                </span>
                <span className="muted" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Calendar size={14} /> Schedule: {selected.event_start_date === selected.event_end_date ? fmtWeekday(selected.event_start_date) : `${fmtWeekday(selected.event_start_date)} - ${fmtWeekday(selected.event_end_date)}`}
                </span>
              </div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>{selected.name}</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 700, color: '#059669' }}>
                  {selected.participant_count ?? '—'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Users size={13} /> Registered Roster
                </span>
              </div>
              <div style={{ height: '32px', width: '1px', background: '#cbd5e1' }} />
              <div style={{ textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 700, color: '#2563eb' }}>
                  {rows?.length ?? 0}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <CheckCircle2 size={13} /> Displayed scan records
                </span>
              </div>
            </div>
          </div>
          {windows.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginRight: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Filter size={14} /> Filter Session:
              </span>
              <button
                type="button"
                className={`chip ${filter.session_window_id === undefined ? 'chip-active' : 'chip-window'}`}
                style={{ cursor: 'pointer', padding: '0.35rem 0.75rem' }}
                onClick={() => setFilter((f) => ({ ...f, session_window_id: undefined }))}
              >
                All Sessions ({windows.length})
              </button>
              {windows.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={`chip ${filter.session_window_id === w.id ? 'chip-active' : 'chip-window'}`}
                  style={{ cursor: 'pointer', padding: '0.35rem 0.75rem' }}
                  onClick={() => setFilter((f) => ({ ...f, session_window_id: w.id }))}
                >
                  {w.session_label} ({fmtRange(w.start_time, w.end_time)})
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      </> : (
        <div className="page-head" style={{ marginTop: '1.25rem' }}>
          <div><h3>Scan history</h3><p>Audit log for this event; filters below affect only this table.</p></div>
          <Button variant="secondary" onClick={() => void exportCsv()} disabled={exporting}>
            <Download size={16} /> {exporting ? 'Exporting…' : 'Export scan log'}
          </Button>
        </div>
      )}

      <div className="filter-bar">
        <div className="search">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name or ID number..."
          />
        </div>
        {!selected && !embedded ? (
          <select
            className="filter-control"
            aria-label="Event"
            value={filter.event_id ?? ''}
            onChange={(e) => handleEventChange(e.target.value)}
          >
            <option value="">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        ) : null}
        <select
          className="filter-control"
          aria-label="Session"
          value={filter.session_window_id ?? ''}
          disabled={windows.length === 0}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              session_window_id: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
        >
          <option value="">All sessions</option>
          {windows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.session_label}
            </option>
          ))}
        </select>
        <input
          className="filter-control"
          type="date"
          aria-label="Date"
          value={filter.date ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, date: e.target.value || undefined }))}
        />
        <div className="segmented" role="group" aria-label="Status">
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
      {error ? <p className="error-text">{error}</p> : null}
      {rows === null && !error ? (
        <TableSkeleton
          label="Loading records"
          tableClass="attendance-table"
          rows={8}
          columns={[
            { label: 'Student ID', width: '70%' },
            { label: 'First name', width: '64%' },
            { label: 'Middle name', width: '48%' },
            { label: 'Last name', width: '56%' },
            { label: 'Course', width: '42%' },
            { label: 'Year level', width: '50%' },
            { label: 'Sectioning', width: '36%' },
            { label: 'Dir', variant: 'dir' },
            { label: 'Event', width: '58%' },
            { label: 'Session', width: '52%' },
            { label: 'When', width: '64%' },
            { label: 'By', width: '46%' },
            { label: '', variant: 'actions' },
          ]}
        />
      ) : rows && rows.length === 0 ? (
        <EmptyState title="No records match" />
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data attendance-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>First name</th>
                  <th>Middle name</th>
                  <th>Last name</th>
                  <th>Course</th>
                  <th>Year level</th>
                  <th>Sectioning</th>
                  <th>Dir</th>
                  {!embedded ? <th>Event</th> : null}
                  <th>Session</th>
                  <th>When</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((log) => (
                  <tr key={log.id} className={log.status === 'cancelled' ? 'is-cancelled' : undefined}>
                    <td>{log.student_id_code ?? '—'}</td>
                    <td className={log.status === 'cancelled' ? 'struck' : ''}>
                      <strong>{log.first_name || log.student_name || `Student #${log.student_id}`}</strong>
                    </td>
                    <td className="muted">{log.middle_name || '—'}</td>
                    <td>{log.last_name || '—'}</td>
                    <td className="muted">{log.course || '—'}</td>
                    <td className="muted">{fmtYearLevel(log.year_level)}</td>
                    <td className="muted">{log.student_section ?? '—'}</td>
                    <td>
                      <span className={`dir ${log.direction.toLowerCase()}`}>{log.direction}</span>
                    </td>
                    {!embedded ? <td className="muted">{log.event_name ?? '—'}</td> : null}
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
            onChanged?.()
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
