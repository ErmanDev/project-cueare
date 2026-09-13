import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button, EmptyState } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { fmtRange, fmtTime, fmtWeekday, initial, todayYmd, ymd } from '../../lib/format'
import type { Event } from '../../lib/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function monthCells(cursor: Date): { key: string; day: number; inMonth: boolean }[] {
  const first = startOfMonth(cursor)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return {
      key: ymd(date),
      day: date.getDate(),
      inMonth: date.getMonth() === cursor.getMonth(),
    }
  })
}

function groupByDay(events: Event[]): Map<string, Event[]> {
  const map = new Map<string, Event[]>()
  for (const event of events) {
    const key = ymd(event.event_date)
    const list = map.get(key)
    if (list) list.push(event)
    else map.set(key, [event])
  }
  return map
}

export function AdminDashboard() {
  const { user } = useAuth()
  const [now, setNow] = useState(() => new Date())
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(todayYmd())
  const [events, setEvents] = useState<Event[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const list = await api.get<Event[]>('/admin/events')
      setEvents(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load events')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const byDay = useMemo(() => groupByDay(events ?? []), [events])
  const cells = useMemo(() => monthCells(cursor), [cursor])
  const today = ymd(now)
  const selectedEvents = byDay.get(selected) ?? []
  const selectedInView = selected.startsWith(
    `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
  )

  function goMonth(delta: number) {
    const next = addMonths(cursor, delta)
    setCursor(next)
    const nextKey = ymd(next)
    const monthPrefix = nextKey.slice(0, 7)
    if (today.startsWith(monthPrefix)) {
      setSelected(today)
      return
    }
    const firstEvent = [...byDay.keys()].filter((key) => key.startsWith(monthPrefix)).sort()[0]
    setSelected(firstEvent ?? nextKey)
  }

  return (
    <div className="home home-cal">
      <div className="page-head">
        <div>
          <h2>Superadmin</h2>
          <p>This month’s events, by date</p>
        </div>
        <time className="home-now" dateTime={now.toISOString()}>
          <span className="home-now-time">{fmtTime(now)}</span>
          <span className="home-now-date">{fmtWeekday(now)}</span>
        </time>
      </div>
      <div className="card welcome-card">
        <div className="avatar lg">{initial(user?.name ?? 'A')}</div>
        <div>
          <h3>Welcome, {user?.name ?? 'Admin'}</h3>
          <p className="muted">@{user?.username}</p>
        </div>
      </div>
      {error && events === null ? (
        <EmptyState
          title="Couldn’t load events"
          subtitle={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : (
        <div className="cal">
          <section className="card cal-board" aria-label="Event calendar">
            <div className="cal-toolbar">
              <h3 className="cal-month">{monthTitle.format(cursor)}</h3>
              <div className="row">
                <button
                  type="button"
                  className="icon-btn"
                  title="Previous month"
                  aria-label="Previous month"
                  onClick={() => goMonth(-1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <Button variant="secondary" className="btn-sm" onClick={() => {
                  const now = startOfMonth(new Date())
                  setCursor(now)
                  setSelected(todayYmd())
                }}>
                  Today
                </Button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Next month"
                  aria-label="Next month"
                  onClick={() => goMonth(1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="cal-week" aria-hidden="true">
              {WEEKDAYS.map((d) => (
                <span key={d} className="cal-dow">
                  {d}
                </span>
              ))}
            </div>
            <div className="cal-grid">
              {events === null
                ? cells.map((cell) => (
                    <div key={cell.key} className={`cal-day${cell.inMonth ? '' : ' out'}`} aria-hidden="true">
                      <span className="cal-num">{cell.day}</span>
                    </div>
                  ))
                : cells.map((cell) => {
                    const dayEvents = byDay.get(cell.key) ?? []
                    const isToday = cell.key === today
                    const isSelected = cell.key === selected
                    const extra = Math.max(0, dayEvents.length - 2)
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        className={`cal-day${cell.inMonth ? '' : ' out'}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                        aria-pressed={isSelected}
                        aria-label={`${cell.key}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                        onClick={() => {
                          setSelected(cell.key)
                          if (!cell.inMonth) {
                            const [y, m] = cell.key.split('-').map(Number)
                            setCursor(new Date(y!, (m ?? 1) - 1, 1))
                          }
                        }}
                      >
                        <span className="cal-num">{cell.day}</span>
                        {dayEvents.length > 0 ? (
                          <>
                            <span className="cal-events">
                              {dayEvents.slice(0, 2).map((event) => (
                                <span
                                  key={event.id}
                                  className={`cal-pill${event.is_active ? '' : ' inactive'}`}
                                >
                                  {event.name}
                                </span>
                              ))}
                              {extra > 0 ? <span className="cal-more">+{extra}</span> : null}
                            </span>
                            <span className="cal-dots" aria-hidden="true">
                              {dayEvents.slice(0, 3).map((event) => (
                                <span
                                  key={event.id}
                                  className={`cal-dot${event.is_active ? '' : ' inactive'}`}
                                />
                              ))}
                            </span>
                          </>
                        ) : null}
                      </button>
                    )
                  })}
            </div>
          </section>
          <aside className="card cal-panel">
            <div className="row">
              <h3 className="grow">
                {selected === today ? 'Today' : fmtWeekday(`${selected}T12:00:00`)}
              </h3>
              {selected === today ? <span className="chip chip-today">Today</span> : null}
            </div>
            {!selectedInView ? (
              <p className="muted">Pick a day in {monthTitle.format(cursor)}.</p>
            ) : selectedEvents.length === 0 ? (
              <p className="muted">No events on this date.</p>
            ) : (
              <ul className="cal-list">
                {selectedEvents.map((event) => (
                  <li key={event.id}>
                    <div className="row">
                      <strong className="grow">{event.name}</strong>
                      <span className={event.is_active ? 'chip chip-active' : 'chip chip-inactive'}>
                        {event.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {event.session_windows.length > 0 ? (
                      <div className="windows">
                        {event.session_windows.map((w) => (
                          <span key={w.id} className="chip chip-window">
                            {w.session_label} {fmtRange(w.start_time, w.end_time)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">No sessions</p>
                    )}
                    {event.fine_policy?.template_name ? (
                      <p className="muted">{event.fine_policy.template_name}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Link to="/superadmin/events" className="cal-open">
              Open Events
            </Link>
          </aside>
        </div>
      )}
    </div>
  )
}
