import { fmtRange } from '../../lib/format'
import { useModerator } from '../../lib/moderator'
import type { Event } from '../../lib/types'

export function SessionOverride({ event }: { event: Event }) {
  const { override, setOverride } = useModerator()
  const windows = event.session_windows
  const selected = windows.find((w) => w.id === override)
  const auto = windows.find((w) => w.id === event.current_session_window_id)

  if (windows.length === 0) {
    return (
      <p className="error-text">
        This event has no session windows — ask the superadmin to add them.
      </p>
    )
  }

  return (
    <div>
      <div className="segmented">
        <button
          type="button"
          className={override == null ? 'active' : ''}
          onClick={() => setOverride(null)}
        >
          Auto
        </button>
        {windows.map((w) => (
          <button
            key={w.id}
            type="button"
            className={override === w.id ? 'active' : ''}
            onClick={() => setOverride(w.id)}
          >
            {w.session_label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        {override == null
          ? auto
            ? `Auto: ${auto.session_label} (${fmtRange(auto.start_time, auto.end_time)})`
            : 'Auto: no session is open right now — pick one manually.'
          : `Manual: all scans will count for ${selected?.session_label ?? ''}`}
      </p>
    </div>
  )
}
