import { useEffect, useState } from 'react'
import { ArrowLeft, LockKeyhole, Search, UserCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button, EmptyState, Field, FormActions, Modal, TableSkeleton, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDateTime, fmtWeekday, phpAmount } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { Event, EventAttendanceSummary, EventParticipant } from '../../lib/types'
import { AdminAttendance } from './Attendance'

const PAGE_SIZE = 25
const STATUSES = ['PENDING', 'PRESENT', 'LATE', 'ABSENT', 'EXCUSED'] as const

export function EventAttendanceDetail() {
  const { eventId: rawEventId } = useParams<{ eventId: string }>()
  const eventId = Number(rawEventId)
  const validEventId = Number.isSafeInteger(eventId) && eventId > 0
  const { toast } = useToast()
  const [event, setEvent] = useState<Event | null>(null)
  const [summary, setSummary] = useState<EventAttendanceSummary | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [participants, setParticipants] = useState<EventParticipant[] | null>(null)
  const [participantTotal, setParticipantTotal] = useState(0)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sessionId, setSessionId] = useState<number | undefined>()
  const [status, setStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [closing, setClosing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [manualTarget, setManualTarget] = useState<EventParticipant | null>(null)
  const [manualSessionId, setManualSessionId] = useState<number | undefined>()
  const [manualReason, setManualReason] = useState('')
  const [manualBusy, setManualBusy] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!validEventId) return
    let active = true
    Promise.all([
      api.get<EventAttendanceSummary>(`/admin/events/${eventId}/attendance-summary`),
      api.get<Event[]>('/admin/events'),
    ]).then(([nextSummary, events]) => {
      if (!active) return
      const nextEvent = events.find((item) => item.id === eventId)
      if (!nextEvent) throw new Error('Event not found')
      setSummary(nextSummary)
      setEvent(nextEvent)
      setPageError(null)
    }).catch((error: unknown) => {
      if (active) setPageError(error instanceof Error ? error.message : 'Failed to load event')
    })
    return () => { active = false }
  }, [eventId, validEventId, revision])

  useEffect(() => {
    if (!validEventId) return
    let active = true
    setParticipants(null)
    api.get<{ rows: EventParticipant[]; total: number }>(`/admin/events/${eventId}/participants`, {
      q: debouncedSearch || undefined,
      session_id: sessionId,
      status,
      page,
      limit: PAGE_SIZE,
    }).then((result) => {
      if (!active) return
      setParticipants(result.rows)
      setParticipantTotal(result.total)
      setRosterError(null)
    }).catch((error: unknown) => {
      if (active) setRosterError(error instanceof Error ? error.message : 'Failed to load roster')
    })
    return () => { active = false }
  }, [eventId, validEventId, debouncedSearch, sessionId, status, page, revision])

  async function syncRoster() {
    setSyncing(true)
    try {
      const result = await api.post<{ participant_count: number }>(`/admin/events/${eventId}/participants/sync`, {})
      toast(`Synced ${result.participant_count} registered participants`)
      setRevision((value) => value + 1)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Roster sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  async function closeEvent() {
    if (!event || !window.confirm(`Close "${event.name}"? All remaining sessions will close. Missing attendance and event fines will be assessed. This cannot be undone.`)) return
    setClosing(true)
    try {
      const result = await api.post<{ assessmentsCreated: number; totalAmountAssessed: number }>(`/admin/events/${eventId}/close`)
      toast(`Event closed; ${result.assessmentsCreated} fine${result.assessmentsCreated === 1 ? '' : 's'} assessed (${phpAmount(result.totalAmountAssessed)})`)
      setRevision((value) => value + 1)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Event close failed', 'error')
    } finally {
      setClosing(false)
    }
  }

  async function manualCheckIn() {
    if (!manualTarget || !manualSessionId || !manualReason.trim()) return
    setManualBusy(true)
    try {
      await api.post(`/admin/events/${eventId}/attendance/check-in`, {
        student_id: manualTarget.student_id,
        session_window_id: manualSessionId,
        reason: manualReason.trim(),
      })
      toast('Manual check-in recorded')
      setManualTarget(null)
      setManualReason('')
      setRevision((value) => value + 1)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Manual check-in failed', 'error')
    } finally {
      setManualBusy(false)
    }
  }

  if (!validEventId) return <EmptyState title="Invalid event" />
  if (pageError) return <><Link to="/superadmin/events" className="btn btn-secondary"><ArrowLeft size={16} /> Events</Link><p className="error-text">{pageError}</p></>
  if (!event || !summary || event.id !== eventId || summary.event_id !== eventId) return <TableSkeleton label="Loading event attendance" rows={4} columns={[{ label: 'Event', width: '70%' }]} />

  const rate = summary.registered > 0 ? `${Math.round(summary.checked_in / summary.registered * 100)}%` : '—'
  const lastPage = Math.max(1, Math.ceil(participantTotal / PAGE_SIZE))
  const availableSessions = (person: EventParticipant) => event.session_windows.filter((window) =>
    !summary.sessions.find((item) => item.session_id === window.id)?.is_closed &&
    !person.sessions?.find((item) => item.session_id === window.id)?.checked_in_at_utc,
  )
  const targetSessions = manualTarget ? availableSessions(manualTarget) : []

  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <Link to="/superadmin/events" className="btn btn-secondary"><ArrowLeft size={16} /> All Events</Link>
        <Link to="/superadmin/attendance" className="btn btn-secondary">Global log</Link>
        <Link to={`/superadmin/events/${eventId}/fines`} className="btn btn-secondary">Event fines</Link>
      </div>
      <div className="page-head">
        <div>
          <h2>{event.name}</h2>
          <p>{event.event_start_date === event.event_end_date ? fmtWeekday(event.event_start_date) : `${fmtWeekday(event.event_start_date)} – ${fmtWeekday(event.event_end_date)}`} · {event.event_status === 'PUBLISHED' ? 'Active event' : `${event.event_status[0]}${event.event_status.slice(1).toLowerCase()} event`}</p>
        </div>
        {event.event_status === 'PUBLISHED' ? <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={() => void syncRoster()} disabled={syncing}>
            <UserCheck size={16} /> {syncing ? 'Syncing…' : 'Sync roster'}
          </Button>
          <Button variant="secondary" onClick={() => void closeEvent()} disabled={closing}>
            <LockKeyhole size={16} /> {closing ? 'Closing…' : 'Close event'}
          </Button>
        </div> : null}
      </div>

      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {([
          ['Registered', summary.registered],
          ['Checked in', summary.checked_in],
          ['Participation rate', rate],
          ['Not yet checked in', summary.not_yet_checked_in],
        ] as const).map(([label, value]) => (
          <div className="card" key={label} style={{ padding: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem' }}>{label}</div>
            <strong style={{ display: 'block', fontSize: '1.65rem', marginTop: '0.3rem' }}>{value}</strong>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Sessions</h3>
        {summary.sessions.length === 0 ? <p className="muted">No sessions configured.</p> : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Session</th><th>Checked in</th><th>Checked out</th><th>Pending</th><th>Absent</th><th>Excused</th></tr></thead>
              <tbody>{summary.sessions.map((item) => {
                const session = event.session_windows.find((window) => window.id === item.session_id)
                return <tr key={item.session_id}>
                  <td><strong>{session?.session_label ?? `Session #${item.session_id}`}</strong><br /><span className="muted">{item.is_closed ? 'Closed' : 'Open'}</span></td>
                  <td>{item.checked_in}</td><td>{item.checked_out}</td><td>{item.pending}</td><td>{item.absent}</td><td>{item.excused}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="page-head"><div><h3>Participant roster</h3><p>Current attendance by registered student and session.</p></div></div>
      <div className="filter-bar">
        <div className="search"><Search size={16} /><input aria-label="Search participants" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search name or student ID..." /></div>
        <select className="filter-control" aria-label="Roster session" value={sessionId ?? ''} onChange={(e) => { setSessionId(e.target.value ? Number(e.target.value) : undefined); setStatus(undefined); setPage(1) }}>
          <option value="">All sessions</option>
          {event.session_windows.map((window) => <option key={window.id} value={window.id}>{window.session_label}</option>)}
        </select>
        <select className="filter-control" aria-label="Roster status" value={status ?? ''} disabled={!sessionId} onChange={(e) => { setStatus(e.target.value || undefined); setPage(1) }}>
          <option value="">All statuses</option>
          {STATUSES.map((value) => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}
        </select>
      </div>
      {rosterError ? <p className="error-text">{rosterError}</p> : null}
      {rosterError ? null : participants === null ? <TableSkeleton label="Loading participants" rows={5} columns={[{ label: 'Student', width: '70%' }, { label: 'Sessions', width: '80%' }]} /> : participants.length === 0 ? <EmptyState title="No participants match" /> : (
        <div className="card table-card">
          <div className="table-wrap"><table className="data"><thead><tr><th>Student</th><th>ID</th><th>Section</th><th>Session attendance</th><th /></tr></thead>
            <tbody>{participants?.map((person) => <tr key={person.student_id}>
              <td><strong>{[person.first_name, person.middle_name, person.last_name].filter(Boolean).join(' ')}</strong></td>
              <td>{person.student_id_code ?? '—'}</td><td>{person.section ?? '—'}</td>
              <td>{(person.sessions ?? []).filter((item) => sessionId === undefined || item.session_id === sessionId).map((item) => <div key={item.session_id} style={{ marginBottom: '0.3rem' }}>
                <strong>{item.session_name}</strong> · {item.status}
                {item.checked_in_at_utc ? ` · IN ${fmtDateTime(item.checked_in_at_utc)}` : ''}
                {item.checked_out_at_utc ? ` · OUT ${fmtDateTime(item.checked_out_at_utc)}` : ''}
              </div>)}</td>
              <td>{event.is_active && availableSessions(person).length > 0 ? (
                <Button variant="secondary" onClick={() => {
                  const options = availableSessions(person)
                  setManualTarget(person)
                  setManualSessionId(options.find((window) => window.id === sessionId)?.id ?? options[0]?.id)
                  setManualReason('')
                }}>Manual check-in</Button>
              ) : null}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="table-meta pager-bar"><p className="muted">Showing {participantTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, participantTotal)} of {participantTotal}</p>
            <nav className="pager" aria-label="Participant pages">
              <button type="button" className="pager-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>{page} / {lastPage}</span>
              <button type="button" className="pager-btn" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          </div>
        </div>
      )}

      <details style={{ marginTop: '1.5rem' }} onToggle={(e) => setHistoryOpen(e.currentTarget.open)}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Scan history and corrections</summary>
        {historyOpen ? <AdminAttendance key={`${eventId}-${revision}`} embedded onChanged={() => setRevision((value) => value + 1)} /> : null}
      </details>
      {manualTarget ? <Modal title="Manual check-in" onClose={() => setManualTarget(null)}>
        <form className="form-grid" onSubmit={onSubmit(manualCheckIn)}>
          <p><strong>{[manualTarget.first_name, manualTarget.middle_name, manualTarget.last_name].filter(Boolean).join(' ')}</strong> · {manualTarget.student_id_code}</p>
          <Field label="Session">
            <select required value={manualSessionId ?? ''} onChange={(e) => setManualSessionId(Number(e.target.value))}>
              {targetSessions.map((window) => <option key={window.id} value={window.id}>{window.session_label}</option>)}
            </select>
          </Field>
          <Field label="Reason">
            <input required maxLength={175} value={manualReason} onChange={(e) => setManualReason(e.target.value)} placeholder="Why was QR scanning unavailable?" />
          </Field>
          <p className="muted">Records an IN at the current server time. Admins can check in after the QR cutoff on the session day; late arrivals show as Late. Closed sessions remain locked.</p>
          <FormActions onCancel={() => setManualTarget(null)} submitLabel="Check in" busy={manualBusy} />
        </form>
      </Modal> : null}
    </>
  )
}
