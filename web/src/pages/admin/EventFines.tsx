import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { EmptyState, TableSkeleton } from '../../components/ui'
import { api } from '../../lib/api'
import { phpAmount } from '../../lib/format'

type Assessment = {
  assessment_id: number
  student_id: number
  student_number: string
  first_name: string
  last_name: string
  session_id: number
  session_name: string
  violation_code: string
  status: string
  assessed_amount: number
  paid_amount: number
  outstanding_amount: number
}
type Preview = Pick<Assessment, 'student_id' | 'student_number' | 'first_name' | 'last_name' | 'session_id' | 'session_name' | 'violation_code'> & { amount: number }
type Report = {
  event_id: number
  event_name: string
  available: boolean
  policy: { name: string; status: string; currency: string; maximum_per_student: number | null } | null
  rules: { session_id: number; session_name: string; rules: { rule_id: number; violation_code: string; effective_fine_amount: number; override: unknown | null }[] }[]
  assessments: Assessment[]
  preview: Preview[]
}

function violation(code: string) {
  return code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())
}

export function EventFines() {
  const { eventId: rawId } = useParams<{ eventId: string }>()
  const eventId = Number(rawId)
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sessionId, setSessionId] = useState<number | null>(null)

  useEffect(() => {
    if (!Number.isSafeInteger(eventId) || eventId <= 0) return
    let active = true
    api.get<Report>(`/admin/events/${eventId}/fines`)
      .then((value) => { if (active) { setReport(value); setError(null) } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load event fines') })
    return () => { active = false }
  }, [eventId])

  const sessions = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of report?.assessments ?? []) map.set(row.session_id, row.session_name)
    for (const row of report?.preview ?? []) map.set(row.session_id, row.session_name)
    return [...map].sort((a, b) => a[0] - b[0])
  }, [report])
  const assessed = report?.assessments ?? []
  const preview = report?.preview ?? []
  const totals = {
    assessed: assessed.reduce((sum, row) => sum + row.assessed_amount, 0),
    paid: assessed.reduce((sum, row) => sum + row.paid_amount, 0),
    outstanding: assessed.reduce((sum, row) => sum + row.outstanding_amount, 0),
    waived: assessed.reduce((sum, row) => sum + (row.status === 'WAIVED' || row.status === 'CANCELLED' ? row.assessed_amount : 0), 0),
    preview: preview.reduce((sum, row) => sum + row.amount, 0),
  }
  const breakdown = useMemo(() => {
    const map = new Map<string, { sessionId: number; session: string; violation: string; count: number; assessed: number; paid: number; outstanding: number; preview: number }>()
    for (const row of assessed) {
      const key = `${row.session_id}:${row.violation_code}`
      const item = map.get(key) ?? { sessionId: row.session_id, session: row.session_name, violation: row.violation_code, count: 0, assessed: 0, paid: 0, outstanding: 0, preview: 0 }
      item.count++
      item.assessed += row.assessed_amount
      item.paid += row.paid_amount
      item.outstanding += row.outstanding_amount
      map.set(key, item)
    }
    for (const row of preview) {
      const key = `${row.session_id}:${row.violation_code}`
      const item = map.get(key) ?? { sessionId: row.session_id, session: row.session_name, violation: row.violation_code, count: 0, assessed: 0, paid: 0, outstanding: 0, preview: 0 }
      item.preview += row.amount
      map.set(key, item)
    }
    return [...map.values()]
  }, [assessed, preview])
  const visible = assessed.filter((row) => {
    const needle = search.trim().toLowerCase()
    return (sessionId == null || row.session_id === sessionId) &&
      (!needle || `${row.first_name} ${row.last_name} ${row.student_number}`.toLowerCase().includes(needle))
  })

  if (!Number.isSafeInteger(eventId) || eventId <= 0) return <EmptyState title="Invalid event" />
  if (error) return <><Link to="/superadmin/events" className="btn btn-secondary"><ArrowLeft size={16} /> Events</Link><p className="error-text">{error}</p></>
  if (!report) return <TableSkeleton label="Loading event fines" rows={4} columns={[{ label: 'Student', width: '70%' }]} />

  return <>
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
      <Link to="/superadmin/events" className="btn btn-secondary"><ArrowLeft size={16} /> All Events</Link>
      <Link to={`/superadmin/events/${eventId}/attendance`} className="btn btn-secondary">Attendance</Link>
      <Link to="/superadmin/fines" className="btn btn-secondary">Fine templates</Link>
    </div>
    <div className="page-head"><div><h2>{report.event_name} · Fines</h2><p>Fine calculation and balances for this event.</p></div></div>
    {!report.available ? <EmptyState title="Fine assessment is unavailable" subtitle="The fine assessment tables or balance view are not installed in this database." /> : <>
      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        {report.policy ? <p><strong>{report.policy.name}</strong> · {report.policy.status} · {report.policy.currency} · Per-student cap: {report.policy.maximum_per_student == null ? 'None' : phpAmount(report.policy.maximum_per_student)}</p> :
          <p>No fine policy is attached to this event. Choose a fine template when editing the event.</p>}
        <p className="muted">Absent applies when there is no check-in. Late and missed checkout can both apply if configured. Fines are posted when a session is closed; the cap covers the student’s cumulative assessed amounts for this event. Waived and cancelled fines remain in the assessed total but have no outstanding balance.</p>
      </div>
      {report.rules.some((session) => session.rules.length > 0) ? <>
        <div className="page-head"><div><h3>Configured rates</h3><p>Active rules and effective amounts for each session.</p></div></div>
        <div className="card table-card" style={{ marginBottom: '1.25rem' }}><div className="table-wrap"><table className="data"><thead><tr><th>Session</th><th>Violation</th><th>Rate</th></tr></thead><tbody>
          {report.rules.flatMap((session) => session.rules.map((rule) => <tr key={rule.rule_id}><td>{session.session_name}</td><td>{violation(rule.violation_code)}</td><td>{phpAmount(rule.effective_fine_amount)}{rule.override ? ' · Override' : ''}</td></tr>))}
        </tbody></table></div></div>
      </> : null}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {([['Assessed', totals.assessed], ['Paid', totals.paid], ['Waived / cancelled', totals.waived], ['Outstanding', totals.outstanding], ['Estimate if closed', totals.preview]] as const).map(([label, value]) =>
          <div className="card" key={label} style={{ padding: '1rem' }}><span className="muted">{label}</span><h3>{phpAmount(value)}</h3></div>)}
      </div>
      <div className="page-head"><div><h3>By session and violation</h3><p>Posted amounts and estimates are shown separately.</p></div></div>
      {breakdown.length === 0 ? <EmptyState title="No fines to show" subtitle="Fines appear after a session ends or is closed, if the event has an active policy and matching rules." /> :
        <div className="card table-card" style={{ marginBottom: '1.25rem' }}><div className="table-wrap"><table className="data"><thead><tr><th>Session</th><th>Violation</th><th>Posted</th><th>Assessed</th><th>Paid</th><th>Outstanding</th><th>Estimate</th></tr></thead><tbody>
          {breakdown.map((row) => <tr key={`${row.sessionId}:${row.violation}`}><td>{row.session}</td><td>{violation(row.violation)}</td><td>{row.count}</td><td>{phpAmount(row.assessed)}</td><td>{phpAmount(row.paid)}</td><td>{phpAmount(row.outstanding)}</td><td>{phpAmount(row.preview)}</td></tr>)}
        </tbody></table></div></div>}
      <div className="page-head"><div><h3>Student assessments</h3><p>Existing fines, payment progress, and outstanding balances.</p></div></div>
      <div className="filter-bar">
        <div className="search"><input aria-label="Search students" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student or ID..." /></div>
        <select className="filter-control" aria-label="Filter session" value={sessionId ?? ''} onChange={(e) => setSessionId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">All sessions</option>{sessions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>
      {visible.length === 0 ? <EmptyState title="No student assessments match" /> :
        <div className="card table-card"><div className="table-wrap"><table className="data"><thead><tr><th>Student</th><th>ID</th><th>Session</th><th>Violation</th><th>Status</th><th>Assessed</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>
          {visible.map((row) => <tr key={row.assessment_id}><td><strong>{row.first_name} {row.last_name}</strong></td><td>{row.student_number}</td><td>{row.session_name}</td><td>{violation(row.violation_code)}</td><td>{violation(row.status)}</td><td>{phpAmount(row.assessed_amount)}</td><td>{phpAmount(row.paid_amount)}</td><td>{phpAmount(row.outstanding_amount)}</td></tr>)}
        </tbody></table></div></div>}
      {preview.length > 0 ? <><div className="page-head" style={{ marginTop: '1.25rem' }}><div><h3>Estimated on closure</h3><p>These sessions have ended but remain open. Closing a session posts its fines; attendance changes before closure may change this estimate.</p></div></div>
        <div className="card table-card"><div className="table-wrap"><table className="data"><thead><tr><th>Student</th><th>ID</th><th>Session</th><th>Violation</th><th>Estimated amount</th></tr></thead><tbody>
          {preview.map((row) => <tr key={`${row.student_id}:${row.session_id}:${row.violation_code}`}><td>{row.first_name} {row.last_name}</td><td>{row.student_number}</td><td>{row.session_name}</td><td>{violation(row.violation_code)}</td><td>{phpAmount(row.amount)}</td></tr>)}
        </tbody></table></div></div></> : null}
    </>}
  </>
}
