import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Coins, Filter, LockKeyhole, Pencil, Plus, Search, Trash2, UserCheck, Users, X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EventRosterModal } from '../../components/EventRosterModal'
import { Button, EmptyState, Field, FormActions, Modal, TableSkeleton, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtRange, fmtWeekday, hhmmFromMinutes, isToday, minutes, phpAmount, ymd } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { AcademicTerm, Event, FineTemplate, WindowDraft } from '../../lib/types'

const defaultWindows: WindowDraft[] = [
  { label: 'Morning', start: '07:00', end: '12:00', late_after: '07:30', in_end: '08:30', out_start: '11:30', out_end: '12:30' },
  { label: 'Afternoon', start: '13:00', end: '17:00', late_after: '13:30', in_end: '14:30', out_start: '16:30', out_end: '17:30' },
]

const PRESET_FULL_DAY: WindowDraft[] = [
  { label: 'Morning', start: '07:00', end: '12:00', late_after: '07:30', in_end: '08:30', out_start: '11:30', out_end: '12:30' },
  { label: 'Afternoon', start: '13:00', end: '17:00', late_after: '13:30', in_end: '14:30', out_start: '16:30', out_end: '17:30' },
]

const PRESET_MORNING: WindowDraft[] = [
  { label: 'Morning', start: '07:00', end: '12:00', late_after: '07:30', in_end: '08:30', out_start: '11:30', out_end: '12:30' },
]

const PRESET_AFTERNOON: WindowDraft[] = [
  { label: 'Afternoon', start: '13:00', end: '17:00', late_after: '13:30', in_end: '14:30', out_start: '16:30', out_end: '17:30' },
]

function validateWindows(windows: WindowDraft[], eventDate: string): string | null {
  for (const w of windows) {
    if (!w.label.trim()) return 'Every session needs a label'
    if (minutes(w.start) >= minutes(w.end)) {
      return `"${w.label}": start time must be before end time`
    }
    if (w.late_after && minutes(w.late_after) < minutes(w.start)) {
      return `"${w.label}": Late After time cannot be earlier than session start`
    }
  }
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i]!
      const b = windows[j]!
      if ((a.session_date || eventDate) === (b.session_date || eventDate)
        && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end)) {
        return `"${a.label}" overlaps "${b.label}"`
      }
    }
  }
  return null
}

function hasSessionToday(event: Event): boolean {
  return event.session_windows.some((w) => isToday(w.session_date || event.event_start_date))
}

function sessionLabel(code: string): string {
  if (code === 'GENERAL') return 'General'
  return code
}

function violationLabel(code: string): string {
  if (code === 'MISSED_CHECKOUT') return 'Missed checkout'
  if (code === 'ABSENT') return 'Absent'
  if (code === 'LATE') return 'Late'
  return code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

export function AdminEvents() {
  const { toast } = useToast()
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Event | 'new' | null>(null)
  const [managingRoster, setManagingRoster] = useState<Event | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'TODAY'>('ALL')

  async function load() {
    try {
      const list = await api.get<Event[]>('/admin/events')
      setEvents(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function publishEvent(e: Event) {
    try {
      await api.put(`/admin/events/${e.id}`, { is_active: true })
      toast(`Published ${e.name}`)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
    }
  }

  async function closeEvent(e: Event) {
    if (!window.confirm(`Close "${e.name}"? All remaining sessions will close. Missing attendance and event fines will be assessed. This cannot be undone.`)) return
    try {
      const result = await api.post<{ assessmentsCreated: number; totalAmountAssessed: number }>(`/admin/events/${e.id}/close`)
      toast(`Closed ${e.name}; ${result.assessmentsCreated} fine${result.assessmentsCreated === 1 ? '' : 's'} assessed (${phpAmount(result.totalAmountAssessed)})`)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Event close failed', 'error')
    }
  }

  async function syncRoster(e: Event) {
    try {
      const res = await api.post<{ participant_count: number }>(`/admin/events/${e.id}/participants/sync`, {})
      toast(`Roster and QR passes ready: ${res.participant_count} registrations for "${e.name}"`)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Roster sync failed', 'error')
    }
  }

  async function closeSession(event: Event, sessionId: number, label: string) {
    if (!window.confirm(`Close "${label}" for "${event.name}"? Unscanned registered students will be marked absent.`)) return
    try {
      const result = await api.post<{ assessmentsCreated: number; totalAmountAssessed: number }>(`/admin/events/${event.id}/session-windows/${sessionId}/close`)
      toast(`Closed ${label}; ${result.assessmentsCreated} fine${result.assessmentsCreated === 1 ? '' : 's'} assessed (${phpAmount(result.totalAmountAssessed)})`)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Session close failed', 'error')
    }
  }

  async function remove(e: Event) {
    if (
      !window.confirm(
        `Delete "${e.name}"? All session windows and attendance for this event will be deleted.`,
      )
    ) {
      return
    }
    try {
      await api.delete(`/admin/events/${e.id}`)
      toast('Event deleted')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  const filteredEvents = useMemo(() => {
    if (!events) return []
    return events.filter((e) => {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!e.name.toLowerCase().includes(q)) return false
      }
      if (statusFilter === 'ACTIVE' && !e.is_active) return false
      if (statusFilter === 'INACTIVE' && e.is_active) return false
      if (statusFilter === 'TODAY' && !hasSessionToday(e)) return false
      return true
    })
  }, [events, search, statusFilter])

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Events Configuration</h2>
          <p>Create event and sessions, generate registrations and QR passes, then track attendance for each session.</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} /> New event
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div className="search" style={{ marginBottom: 0 }}>
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events by name..."
          />
          {search ? (
            <button className="icon-btn" onClick={() => setSearch('')} title="Clear">
              <X size={16} />
            </button>
          ) : null}
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.25rem' }}>
            <Filter size={14} /> Filter Status:
          </span>
          <button
            className={`btn ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
            onClick={() => setStatusFilter('ALL')}
          >
            All Events ({events?.length ?? 0})
          </button>
          <button
            className={`btn ${statusFilter === 'TODAY' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
            onClick={() => setStatusFilter('TODAY')}
          >
            Today ({events?.filter(hasSessionToday).length ?? 0})
          </button>
          <button
            className={`btn ${statusFilter === 'ACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            Active ({events?.filter((e) => e.is_active).length ?? 0})
          </button>
          <button
            className={`btn ${statusFilter === 'INACTIVE' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
            onClick={() => setStatusFilter('INACTIVE')}
          >
            Inactive ({events?.filter((e) => !e.is_active).length ?? 0})
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {events === null && !error ? (
        <TableSkeleton
          label="Loading events"
          tableClass="events-table"
          rows={6}
          columns={[
            { label: 'Event', width: '40%' },
            { label: 'Date', variant: 'chip', width: 120 },
            { label: 'Sessions', variant: 'chips' },
            { label: 'Fines', variant: 'chip', width: 140 },
            { label: 'Status', variant: 'chip', width: 72 },
            { label: '', variant: 'actions' },
          ]}
        />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          title="No events found"
          subtitle={
            search || statusFilter !== 'ALL'
              ? 'No events match your search or filter criteria.'
              : 'Create an event, define its sessions, and optionally attach a fine template.'
          }
          action={
            search || statusFilter !== 'ALL' ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('')
                  setStatusFilter('ALL')
                }}
              >
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data events-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Sessions (Cutoffs & Windows)</th>
                  <th>Fines</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((e) => {
                  const today = hasSessionToday(e)
                  return (
                    <tr key={e.id} className={today ? 'is-today' : undefined}>
                      <td>
                        <strong>{e.name}</strong>
                        {e.participant_count !== undefined ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem', fontSize: '0.75rem', color: '#64748b' }}>
                            <Users size={13} />
                            <span>{e.participant_count} registered participant{e.participant_count === 1 ? '' : 's'}</span>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span className={today ? 'today-weight' : undefined}>
                            {e.event_start_date === e.event_end_date
                              ? fmtWeekday(e.event_start_date)
                              : `${fmtWeekday(e.event_start_date)} - ${fmtWeekday(e.event_end_date)}`}
                          </span>
                          {today ? <span className="chip chip-today">Today</span> : null}
                        </div>
                      </td>
                      <td>
                        {e.session_windows.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="windows">
                            {e.session_windows.map((w) => (
                              <span key={w.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span className="chip chip-window" title={w.late_after ? `Late After: ${w.late_after}` : undefined}>
                                  {w.session_date ? `${w.session_date} · ` : ''}{w.session_label} {fmtRange(w.start_time, w.end_time)}
                                  {w.late_after ? <small style={{ color: '#d97706', marginLeft: '0.25rem' }}>[Late &gt; {w.late_after}]</small> : null}
                                </span>
                                {w.is_closed ? (
                                  <span className="chip chip-inactive">Closed</span>
                                ) : e.event_status === 'PUBLISHED' ? (
                                  <button type="button" className="chip chip-inactive" title={`Close ${w.session_label} and mark unscanned students absent`} onClick={() => void closeSession(e, w.id, w.session_label)}>
                                    Close
                                  </button>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        {e.fine_policy?.template_name || e.fine_policy?.policy_name ? (
                          <span className="chip chip-window">
                            {e.fine_policy.template_name ?? e.fine_policy.policy_name}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className={e.event_status === 'PUBLISHED' ? 'chip chip-active' : 'chip chip-inactive'}>
                          {e.event_status === 'PUBLISHED' ? 'Active' : e.event_status === 'DRAFT' ? 'Draft' : e.event_status === 'CLOSED' ? 'Closed' : 'Cancelled'}
                        </span>
                      </td>
                      <td>
                        <div className="menu end">
                          <button
                            className="icon-btn"
                            title="Manage Participants Roster"
                            onClick={() => setManagingRoster(e)}
                            style={{ color: '#0284c7' }}
                          >
                            <Users size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            title="Generate registrations, session roster, and QR passes"
                            onClick={() => void syncRoster(e)}
                            style={{ color: '#059669' }}
                          >
                            <UserCheck size={16} />
                          </button>
                          <Link
                            to={`/superadmin/events/${e.id}/attendance`}
                            className="icon-btn"
                            title="View Event Attendance Dashboard"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}
                          >
                            <ClipboardCheck size={16} />
                          </Link>
                          <Link to={`/superadmin/events/${e.id}/fines`} className="icon-btn" title="View event fines"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                            <Coins size={16} />
                          </Link>
                          {e.event_status === 'PUBLISHED' ? <button className="icon-btn" title="Close event and assess remaining fines" onClick={() => void closeEvent(e)}>
                            <LockKeyhole size={16} />
                          </button> : null}
                          {e.event_status === 'DRAFT' ? <button className="icon-btn" title="Publish event" onClick={() => void publishEvent(e)}>
                            <UserCheck size={16} />
                          </button> : null}
                          <button className="icon-btn" title="Edit Event" onClick={() => setEditing(e)}>
                            <Pencil size={16} />
                          </button>
                          <button className="icon-btn" title="Delete Event" onClick={() => void remove(e)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {events ? (
            <p className="muted table-meta">
              Showing {filteredEvents.length} of {events.length} event{events.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      )}
      {managingRoster ? (
        <EventRosterModal
          event={managingRoster}
          onClose={() => setManagingRoster(null)}
          onUpdated={() => void load()}
        />
      ) : null}
      {editing ? (
        <EventForm
          existing={editing === 'new' ? null : editing}
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

export function EventForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: Event | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isEdit = existing != null
  const [name, setName] = useState(existing?.name ?? '')
  const [startDate, setStartDate] = useState(existing ? ymd(existing.event_start_date) : ymd(new Date()))
  const [endDate, setEndDate] = useState(existing ? ymd(existing.event_end_date) : ymd(new Date()))
  const [active, setActive] = useState(existing?.is_active ?? true)
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [termId, setTermId] = useState(existing?.academic_term_id ? String(existing.academic_term_id) : '')
  const [windows, setWindows] = useState<WindowDraft[]>(
    existing
      ? existing.session_windows.map((w) => ({
          id: w.id,
          label: w.session_label,
          session_date: w.session_date || ymd(existing.event_start_date),
          start: w.start_time,
          end: w.end_time,
          late_after: w.late_after ?? undefined,
          in_end: w.in_end ?? undefined,
          out_start: w.out_start ?? undefined,
          out_end: w.out_end ?? undefined,
        }))
      : defaultWindows,
  )
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState<FineTemplate[] | null>(null)
  const [templateId, setTemplateId] = useState(
    existing?.fine_policy?.template_id != null ? String(existing.fine_policy.template_id) : '',
  )
  const published = templates ?? []
  const selectedTemplate = published.find((t) => String(t.template_id) === templateId) ?? null

  // Audience / Attendees selection state
  const [audienceScope, setAudienceScope] = useState<'ALL_STUDENTS' | 'PROGRAM' | 'YEAR_LEVEL' | 'SECTION'>('ALL_STUDENTS')
  const [selectedProgramCode, setSelectedProgramCode] = useState<'BSIT' | 'BSBA' | ''>('')
  const [selectedYearLevel, setSelectedYearLevel] = useState<number>(1)
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [programsList, setProgramsList] = useState<{ academic_program_id: number; program_code: string; program_name: string }[]>([])
  const [sectionsList, setSectionsList] = useState<{ section_id: number; program_code: string; year_level: number; section_name: string }[]>([])

  useEffect(() => {
    void api
      .get<FineTemplate[]>('/admin/fine-templates', { published: 1 })
      .then((list) => setTemplates(list.filter((t) => t.active_version)))
      .catch(() => setTemplates([]))
    void api
      .get<AcademicTerm[]>('/admin/academic-terms')
      .then((list) => {
        setTerms(list)
        setTermId((current) => current || (list[0] ? String(list[0].academic_term_id) : ''))
      })
      .catch(() => setTerms([]))
    void api
      .get<{ academic_program_id: number; program_code: string; program_name: string }[]>('/admin/academic-programs')
      .then((list) => setProgramsList(list))
      .catch(() => setProgramsList([]))
    void api
      .get<{ section_id: number; program_code: string; year_level: number; section_name: string }[]>('/admin/sections')
      .then((list) => setSectionsList(list))
      .catch(() => setSectionsList([]))

    if (existing) {
      void api
        .get<{ audience_rules: { audience_scope_code: string; program_code?: string; year_level?: number; section_id?: number }[] }>(`/admin/events/${existing.id}/audience-rules`)
        .then((res) => {
          if (res.audience_rules && res.audience_rules.length > 0) {
            const r = res.audience_rules[0]
            if (r.audience_scope_code === 'PROGRAM') {
              setAudienceScope('PROGRAM')
              if (r.program_code) setSelectedProgramCode(r.program_code as 'BSIT' | 'BSBA')
            } else if (r.audience_scope_code === 'YEAR_LEVEL') {
              setAudienceScope('YEAR_LEVEL')
              if (r.year_level) setSelectedYearLevel(r.year_level)
            } else if (r.audience_scope_code === 'SECTION') {
              setAudienceScope('SECTION')
              if (r.section_id) setSelectedSectionId(String(r.section_id))
            }
          }
        })
        .catch(() => {})
    }
  }, [existing])

  async function save() {
    if (!termId) {
      toast('Select an academic term', 'error')
      return
    }
    const err = validateWindows(windows, startDate)
    if (err) {
      toast(err, 'error')
      return
    }
    let audienceRules: { audience_scope_code: string; academic_program_id?: number; year_level?: number; section_id?: number; is_required: boolean }[] = []
    if (audienceScope === 'ALL_STUDENTS') {
      audienceRules = [{ audience_scope_code: 'ALL_STUDENTS', is_required: true }]
    } else if (audienceScope === 'PROGRAM') {
      if (!selectedProgramCode) {
        toast('Select a program / course', 'error')
        return
      }
      const prog = programsList.find((p) => p.program_code === selectedProgramCode)
      if (prog) {
        audienceRules = [{ audience_scope_code: 'PROGRAM', academic_program_id: prog.academic_program_id, is_required: true }]
      }
    } else if (audienceScope === 'YEAR_LEVEL') {
      audienceRules = [{ audience_scope_code: 'YEAR_LEVEL', year_level: Number(selectedYearLevel), is_required: true }]
    } else if (audienceScope === 'SECTION') {
      if (!selectedSectionId) {
        toast('Select a section', 'error')
        return
      }
      const sec = sectionsList.find((s) => String(s.section_id) === selectedSectionId)
      if (sec) {
        const prog = programsList.find((p) => p.program_code === sec.program_code)
        audienceRules = [{
          audience_scope_code: 'SECTION',
          academic_program_id: prog?.academic_program_id,
          year_level: sec.year_level,
          section_id: sec.section_id,
          is_required: true,
        }]
      }
    }

    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        academic_term_id: Number(termId),
        event_start_date: startDate,
        event_end_date: endDate,
        is_active: active,
        fine_template_id: templateId ? Number(templateId) : null,
        audience_rules: audienceRules,
        session_windows: windows.map((w) => ({
          id: w.id,
          session_date: w.session_date || startDate,
          session_label: w.label,
          start_time: w.start,
          end_time: w.end,
          late_after: w.late_after,
          in_end: w.in_end,
          out_start: w.out_start,
          out_end: w.out_end,
        })),
      }
      if (isEdit) {
        await api.put(`/admin/events/${existing.id}`, payload)
      } else {
        await api.post('/admin/events', payload)
      }
      toast(isEdit ? 'Event saved' : 'Event created')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function applyPreset(preset: WindowDraft[]) {
    setWindows(preset)
  }

  function addWindow() {
    let nextStart = '08:00'
    let nextEnd = '09:00'
    if (windows.length > 0) {
      const last = windows[windows.length - 1]!
      const lastEndMins = minutes(last.end)
      if (lastEndMins + 60 < 24 * 60) {
        nextStart = hhmmFromMinutes(lastEndMins)
        nextEnd = hhmmFromMinutes(Math.min(lastEndMins + 60, 24 * 60 - 1))
      }
    }
    const draft: WindowDraft = {
      label: `Session ${windows.length + 1}`,
      session_date: windows.at(-1)?.session_date || startDate,
      start: nextStart,
      end: nextEnd,
      late_after: nextStart,
      in_end: nextEnd,
    }
    setWindows((ws) => [...ws, draft])
  }

  function removeWindow(index: number) {
    const w = windows[index]
    if (!w) return
    if (windows.length <= 1) {
      toast('Event must have at least one session window', 'error')
      return
    }
    const label = w.label.trim() || 'Session'
    if (!window.confirm(`Are you sure you want to remove "${label}"? This will also remove any fine rules attached to this session when saved.`)) {
      return
    }
    setWindows((ws) => ws.filter((_, i) => i !== index))
  }

  return (
    <Modal title={isEdit ? 'Edit event' : 'New event'} onClose={onClose} wide>
      <form className="form-grid" onSubmit={onSubmit(save)}>
        <Field label="Event name">
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Acquaintance Party 2026" />
        </Field>
        <div className="grid-2">
          <Field label="Academic term">
            <select value={termId} onChange={(e) => setTermId(e.target.value)} required>
              <option value="">Select term</option>
              {terms.map((term) => (
                <option key={term.academic_term_id} value={term.academic_term_id}>
                  {term.term_code} · {term.term_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start Date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
          <Field label="End Date">
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required min={startDate} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label="Status">
            <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
        </div>

        {/* Target Attendees Selector */}
        <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Users size={16} /> Target Attendees (Who will join):
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${audienceScope === 'ALL_STUDENTS' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
              onClick={() => setAudienceScope('ALL_STUDENTS')}
            >
              All Enrolled Students
            </button>
            <button
              type="button"
              className={`btn ${audienceScope === 'PROGRAM' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
              onClick={() => setAudienceScope('PROGRAM')}
            >
              By Course / Program
            </button>
            <button
              type="button"
              className={`btn ${audienceScope === 'YEAR_LEVEL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
              onClick={() => setAudienceScope('YEAR_LEVEL')}
            >
              By Year Level
            </button>
            <button
              type="button"
              className={`btn ${audienceScope === 'SECTION' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
              onClick={() => setAudienceScope('SECTION')}
            >
              By Section
            </button>
          </div>

          {audienceScope === 'PROGRAM' && (
            <Field label="Select Course / Program">
              <select value={selectedProgramCode} onChange={(e) => setSelectedProgramCode(e.target.value as 'BSIT' | 'BSBA')}>
                <option value="">Choose Course</option>
                <option value="BSIT">BSIT - Bachelor of Science in Information Technology</option>
                <option value="BSBA">BSBA - Bachelor of Science in Business Administration</option>
              </select>
            </Field>
          )}

          {audienceScope === 'YEAR_LEVEL' && (
            <Field label="Select Year Level">
              <select value={selectedYearLevel} onChange={(e) => setSelectedYearLevel(Number(e.target.value))}>
                <option value={1}>1st Year</option>
                <option value={2}>2nd Year</option>
                <option value={3}>3rd Year</option>
                <option value={4}>4th Year</option>
              </select>
            </Field>
          )}

          {audienceScope === 'SECTION' && (
            <Field label="Select Section">
              <select value={selectedSectionId} onChange={(e) => setSelectedSectionId(e.target.value)}>
                <option value="">Choose Section</option>
                {sectionsList.map((sec) => (
                  <option key={sec.section_id} value={sec.section_id}>
                    {sec.program_code} {sec.year_level}-{sec.section_name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* Session Window Presets */}
        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
            Quick Session Presets:
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => void applyPreset(PRESET_FULL_DAY)}
            >
              Full Day (Morning + Afternoon)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => void applyPreset(PRESET_MORNING)}
            >
              Morning Only
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => void applyPreset(PRESET_AFTERNOON)}
            >
              Afternoon Only
            </button>
          </div>
        </div>

        <div className="row">
          <strong className="grow">Session windows & Cutoffs</strong>
          <Button variant="secondary" className="btn-sm" onClick={() => void addWindow()}>
            <Plus size={14} /> Add
          </Button>
        </div>

        {windows.map((w, i) => (
          <div
            key={w.id ?? `new-${i}`}
            style={{
              padding: '0.85rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#fafafa',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Field label="Session Date">
                <input
                  type="date"
                  value={w.session_date || startDate}
                  onChange={(e) => setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, session_date: e.target.value } : x)))}
                  required
                />
              </Field>
              <Field label="Session Label">
                <input
                  style={{ fontWeight: 600 }}
                  value={w.label}
                  onChange={(e) =>
                    setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  placeholder="e.g. Morning Session"
                />
              </Field>
              <button
                type="button"
                className="icon-btn"
                title="Remove session"
                onClick={() => void removeWindow(i)}
                style={{ color: '#ef4444' }}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Timings Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
              <Field label="Start Time">
                <input
                  type="time"
                  value={w.start}
                  onChange={(e) =>
                    setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                  }
                />
              </Field>

              <Field label="Late After (Late Threshold)">
                <input
                  type="time"
                  value={w.late_after ?? ''}
                  onChange={(e) =>
                    setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, late_after: e.target.value } : x)))
                  }
                  placeholder="e.g. 07:30"
                />
              </Field>

              <Field label="In End (Check-in Cutoff)">
                <input
                  type="time"
                  value={w.in_end ?? ''}
                  onChange={(e) =>
                    setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, in_end: e.target.value } : x)))
                  }
                  placeholder="e.g. 08:30"
                />
              </Field>

              <Field label="End Time">
                <input
                  type="time"
                  value={w.end}
                  onChange={(e) =>
                    setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                  }
                />
              </Field>
            </div>
          </div>
        ))}

        <Field label="Fine template">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">None</option>
            {published.map((t) => (
              <option key={t.template_id} value={t.template_id}>
                {t.template_name}
              </option>
            ))}
          </select>
        </Field>

        {templates == null ? null : templates.length === 0 ? (
          <p className="field-note">
            No published templates.{' '}
            <Link to="/superadmin/fines">Open Fine templates</Link>
          </p>
        ) : selectedTemplate?.active_version ? (
          <div className="windows">
            {selectedTemplate.active_version.rules.map((r) => (
              <span
                key={`${r.session_type_code}-${r.violation_code}-${r.priority_order}`}
                className="chip chip-window"
              >
                {sessionLabel(r.session_type_code)} · {violationLabel(r.violation_code)} ·{' '}
                {phpAmount(r.fine_amount)}
              </span>
            ))}
            <span className="muted">
              Max {phpAmount(selectedTemplate.active_version.max_fine_per_student)}
            </span>
          </div>
        ) : existing?.fine_policy && !templateId ? (
          <p className="field-note">
            {existing.fine_policy.policy_name} is already on this event. Pick a template to replace it.
          </p>
        ) : (
          <p className="field-note">Optional. Copies published rates onto this event’s sessions.</p>
        )}
        <FormActions onCancel={onClose} submitLabel={isEdit ? 'Save' : 'Create'} busy={busy} />
      </form>
    </Modal>
  )
}
