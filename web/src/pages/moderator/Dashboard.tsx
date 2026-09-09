import { History, QrCode, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button, EmptyState } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { fmtRange, fmtWeekday, initial } from '../../lib/format'
import { useModerator } from '../../lib/moderator'
import { SessionOverride } from './SessionOverride'

export function ModeratorDashboard() {
  const { user } = useAuth()
  const { events, selected, select, reload, loading, error } = useModerator()

  return (
    <div className="home">
      <div className="page-head">
        <div>
          <h2>Moderator</h2>
          <p>Pick an event, then start scanning</p>
        </div>
        <Button variant="secondary" onClick={() => void reload()}>
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>
      <div className="card row">
        <div className="avatar">{initial(user?.name ?? 'M')}</div>
        <div>
          <strong>Hi, {user?.name ?? 'Moderator'}</strong>
          <p className="muted">@{user?.username}</p>
        </div>
      </div>
      <h3 style={{ margin: '20px 0 8px' }}>Event</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Choose the event you are scanning for
      </p>
      {error ? <p className="error-text">{error}</p> : null}
      {loading && events.length === 0 ? <p className="muted">Loading events…</p> : null}
      {!loading && events.length === 0 ? (
        <EmptyState
          title="No active events"
          subtitle="Ask the superadmin to create one and mark it active."
        />
      ) : null}
      {events.length > 1 ? (
        <label className="field" style={{ marginBottom: 12 }}>
          <span>Select event</span>
          <select value={selected?.id ?? ''} onChange={(e) => select(Number(e.target.value))}>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.is_today ? ' (today)' : ''}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selected ? (
        <>
          <article className="card welcome-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="row">
              <h3 className="grow">{selected.name}</h3>
              {selected.is_today ? <span className="chip chip-today">Today</span> : null}
            </div>
            <p>{fmtWeekday(selected.event_date)}</p>
            <div className="windows">
              {selected.session_windows.map((w) => (
                <span
                  key={w.id}
                  className={`chip chip-window${w.id === selected.current_session_window_id ? ' current' : ''}`}
                >
                  {w.session_label} {fmtRange(w.start_time, w.end_time)}
                </span>
              ))}
            </div>
          </article>
          <h3 style={{ margin: '20px 0 8px' }}>Session for next scans</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Auto uses the open window, or pick one manually
          </p>
          <SessionOverride event={selected} />
          <div className="list" style={{ marginTop: 24 }}>
            <Link
              to="/scanner/scan"
              className="btn btn-primary"
              style={{ minHeight: 64, fontSize: 20, pointerEvents: selected.session_windows.length ? undefined : 'none', opacity: selected.session_windows.length ? 1 : 0.5 }}
            >
              <QrCode size={28} /> Start scanning
            </Link>
            <Link to="/scanner/history" className="btn btn-secondary">
              <History size={18} /> My scans today
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}
