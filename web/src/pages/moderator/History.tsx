import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { Button, EmptyState, ScanHistorySkeleton } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDateTime } from '../../lib/format'
import { useModerator } from '../../lib/moderator'
import { useToast } from '../../lib/toast'
import type { AttendanceLog } from '../../lib/types'

export function ModeratorHistory() {
  const { toast } = useToast()
  const { selected } = useModerator()
  const [rows, setRows] = useState<AttendanceLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const list = await api.get<AttendanceLog[]>('/moderator/scans/mine', {
        event_id: selected?.id,
      })
      setRows(list)
      setError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load scans'
      setError(message)
      toast(message, 'error')
    }
  }

  useEffect(() => {
    void load()
  }, [selected?.id])

  const ins = (rows ?? []).filter((l) => l.direction === 'IN').length
  const outs = (rows ?? []).length - ins

  return (
    <>
      <div className="page-head">
        <div>
          <h2>My scans today</h2>
          <p>{selected ? selected.name : 'All events'}</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {rows === null && !error ? (
        <ScanHistorySkeleton />
      ) : rows && rows.length === 0 ? (
        <EmptyState title="No scans yet today" subtitle={selected ? `Event: ${selected.name}` : undefined} />
      ) : (
        <>
          <div className="card row stats-row">
            <div className="stat">
              <b>{rows?.length ?? 0}</b>
              <span className="muted">Total</span>
            </div>
            <div className="stat stat-in">
              <b>{ins}</b>
              <span className="muted">IN</span>
            </div>
            <div className="stat stat-out">
              <b>{outs}</b>
              <span className="muted">OUT</span>
            </div>
          </div>
          <div className="card table-card">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Dir</th>
                    <th>Student</th>
                    <th>Session</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className={`dir ${log.direction.toLowerCase()}`}>{log.direction}</span>
                      </td>
                      <td>
                        <strong>{log.student_name ?? `Student #${log.student_id}`}</strong>
                        <div className="muted">{log.student_id_code}</div>
                      </td>
                      <td>{log.session_label}</td>
                      <td>{fmtDateTime(log.scanned_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
