import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button, EmptyState, Field, FormActions, Modal, TableSkeleton, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtRange, fmtWeekday, isToday, minutes, ymd } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { Event, SessionWindow, WindowDraft } from '../../lib/types'

const defaultWindows: WindowDraft[] = [
  { label: 'Morning', start: '07:00', end: '12:00' },
  { label: 'Afternoon', start: '13:00', end: '17:00' },
]

function validateWindows(windows: WindowDraft[]): string | null {
  for (const w of windows) {
    if (!w.label.trim()) return 'Every session needs a label'
    if (minutes(w.start) >= minutes(w.end)) {
      return `"${w.label}": start time must be before end time`
    }
  }
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i]!
      const b = windows[j]!
      if (minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end)) {
        return `"${a.label}" overlaps "${b.label}"`
      }
    }
  }
  return null
}

export function AdminEvents() {
  const { toast } = useToast()
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Event | 'new' | null>(null)

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

  async function toggleActive(e: Event) {
    try {
      await api.put(`/admin/events/${e.id}`, { is_active: !e.is_active })
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
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

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Events</h2>
          <p>Create events and Morning / Afternoon windows</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} /> New event
        </Button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {events === null && !error ? (
        <TableSkeleton
          label="Loading events"
          tableClass="events-table"
          rows={6}
          columns={[
            { label: 'Event', width: '68%' },
            { label: 'Date', variant: 'chip', width: 88 },
            { label: 'Sessions', variant: 'chips' },
            { label: 'Status', variant: 'chip', width: 72 },
            { label: '', variant: 'actions' },
          ]}
        />
      ) : events && events.length === 0 ? (
        <EmptyState
          title="No events yet"
          subtitle="Create an event and define its Morning / Afternoon sessions."
        />
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data events-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Date</th>
                  <th>Sessions</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(events ?? []).map((e) => {
                  const today = isToday(e.event_date)
                  return (
                    <tr key={e.id} className={today ? 'is-today' : undefined}>
                      <td>
                        <strong>{e.name}</strong>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <span className={today ? 'today-weight' : undefined}>{fmtWeekday(e.event_date)}</span>
                          {today ? <span className="chip chip-today">Today</span> : null}
                        </div>
                      </td>
                      <td>
                        {e.session_windows.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="windows">
                            {e.session_windows.map((w) => (
                              <span key={w.id} className="chip chip-window">
                                {w.session_label} {fmtRange(w.start_time, w.end_time)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={e.is_active ? 'chip chip-active' : 'chip chip-inactive'}
                          aria-pressed={e.is_active}
                          title={e.is_active ? 'Mark inactive' : 'Mark active'}
                          onClick={() => void toggleActive(e)}
                        >
                          {e.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <div className="menu end">
                          <button className="icon-btn" title="Edit" onClick={() => setEditing(e)}>
                            <Pencil size={16} />
                          </button>
                          <button className="icon-btn" title="Delete" onClick={() => void remove(e)}>
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
              {events.length} event{events.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      )}
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
  const [date, setDate] = useState(existing ? ymd(existing.event_date) : ymd(new Date()))
  const [active, setActive] = useState(existing?.is_active ?? true)
  const [windows, setWindows] = useState<WindowDraft[]>(
    existing
      ? existing.session_windows.map((w) => ({
          id: w.id,
          label: w.session_label,
          start: w.start_time,
          end: w.end_time,
        }))
      : defaultWindows,
  )
  const [busy, setBusy] = useState(false)
  const minDate = useMemo(() => ymd(new Date()), [])

  async function save() {
    const err = validateWindows(windows)
    if (err) {
      toast(err, 'error')
      return
    }
    setBusy(true)
    try {
      if (isEdit) {
        await api.put(`/admin/events/${existing.id}`, {
          name: name.trim(),
          event_date: date,
          is_active: active,
        })
      } else {
        await api.post('/admin/events', {
          name: name.trim(),
          event_date: date,
          is_active: active,
          session_windows: windows.map((w) => ({
            session_label: w.label,
            start_time: w.start,
            end_time: w.end,
          })),
        })
      }
      toast(isEdit ? 'Event saved' : 'Event created')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function addWindow() {
    const draft: WindowDraft = { label: 'Session', start: '08:00', end: '09:00' }
    if (isEdit) {
      try {
        const created = await api.post<SessionWindow>(`/admin/events/${existing.id}/session-windows`, {
          session_label: draft.label,
          start_time: draft.start,
          end_time: draft.end,
        })
        setWindows((ws) => [
          ...ws,
          {
            id: created.id,
            label: created.session_label,
            start: created.start_time,
            end: created.end_time,
          },
        ])
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not add session', 'error')
      }
      return
    }
    setWindows((ws) => [...ws, draft])
  }

  async function persistWindow(index: number, draft: WindowDraft) {
    if (!isEdit) return
    try {
      if (draft.id) {
        const updated = await api.put<SessionWindow>(`/admin/session-windows/${draft.id}`, {
          session_label: draft.label,
          start_time: draft.start,
          end_time: draft.end,
        })
        setWindows((ws) =>
          ws.map((w, i) =>
            i === index
              ? {
                  id: updated.id,
                  label: updated.session_label,
                  start: updated.start_time,
                  end: updated.end_time,
                }
              : w,
          ),
        )
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Window save failed', 'error')
    }
  }

  async function removeWindow(index: number) {
    const w = windows[index]
    if (!w) return
    if (isEdit && w.id) {
      if (!window.confirm(`Delete session "${w.label}"?`)) return
      try {
        await api.delete(`/admin/session-windows/${w.id}`)
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Could not delete session', 'error')
        return
      }
    }
    setWindows((ws) => ws.filter((_, i) => i !== index))
  }

  return (
    <Modal title={isEdit ? 'Edit event' : 'New event'} onClose={onClose} wide>
      <form className="form-grid" onSubmit={onSubmit(save)}>
        <Field label="Event name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid-2">
          <Field label="Date">
            <input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Status">
            <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
        </div>
        <div className="row">
          <strong className="grow">Session windows</strong>
          <Button variant="secondary" className="btn-sm" onClick={() => void addWindow()}>
            <Plus size={14} /> Add
          </Button>
        </div>
        {windows.map((w, i) => (
          <div key={w.id ?? `new-${i}`} className="grid-2 grid-end">
            <Field label="Label">
              <input
                value={w.label}
                onChange={(e) =>
                  setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
                onBlur={() => void persistWindow(i, windows[i]!)}
              />
            </Field>
            <div className="row">
              <Field label="Start">
                <input
                  type="time"
                  value={w.start}
                  onChange={(e) =>
                    setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                  }
                  onBlur={() => void persistWindow(i, windows[i]!)}
                />
              </Field>
              <Field label="End">
                <input
                  type="time"
                  value={w.end}
                  onChange={(e) =>
                    setWindows((ws) => ws.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                  }
                  onBlur={() => void persistWindow(i, windows[i]!)}
                />
              </Field>
              <button type="button" className="icon-btn" title="Remove" onClick={() => void removeWindow(i)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        <FormActions onCancel={onClose} submitLabel={isEdit ? 'Save' : 'Create'} busy={busy} />
      </form>
    </Modal>
  )
}
