import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button, EmptyState, Field, FormActions, Modal, TableSkeleton, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { phpAmount } from '../../lib/format'
import { useToast } from '../../lib/toast'

type ContributionType = { id: number; name: string; default_amount: number; due_date: string | null; is_required: boolean }
type Registration = { registration_id: number; student_number: string; first_name: string; last_name: string; registration_status: string }
type Contribution = { id: number; registration_id: number; type_id: number; name: string; student_number: string; first_name: string; last_name: string; amount_due: number; waiver_amount: number; waiver_reason: string | null; paid_amount: number; outstanding_amount: number; status: string }
type Payment = { id: number; contribution_id: number; amount: number; method: string; reference: string; external_reference: string | null; status: string; received_at: string; received_by: string; void_reason: string | null; voided_at: string | null; voided_by: string | null }
type Report = { event_id: number; event_name: string; event_status: string; types: ContributionType[]; roster: Registration[]; contributions: Contribution[]; payments: Payment[] }
type Task = { kind: 'create' } | { kind: 'assign'; type: ContributionType } | { kind: 'pay'; row: Contribution } | { kind: 'waive'; row: Contribution } | { kind: 'void'; payment: Payment; row: Contribution }
const PAGE_SIZE = 25
const receiptReference = () => `CTR-${crypto.randomUUID()}`
const statusLabel = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())

export function EventContributions() {
  const { eventId: rawId } = useParams()
  return <ContributionPage key={rawId} rawId={rawId} />
}

function ContributionPage({ rawId }: { rawId: string | undefined }) {
  const eventId = Number(rawId)
  const valid = Number.isSafeInteger(eventId) && eventId > 0
  const path = `/admin/events/${eventId}/contributions`
  const { toast } = useToast()
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [task, setTask] = useState<Task | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState('')
  const [required, setRequired] = useState(true)
  const [all, setAll] = useState(true)
  const [selected, setSelected] = useState<number[]>([])
  const [rosterSearch, setRosterSearch] = useState('')
  const [method, setMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [external, setExternal] = useState('')
  const [reason, setReason] = useState('')
  const [historyId, setHistoryId] = useState<number | null>(null)
  const historyHeading = useRef<HTMLHeadingElement>(null)
  const historyTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (historyId !== null) {
      historyHeading.current?.scrollIntoView({ block: 'start' })
      historyHeading.current?.focus({ preventScroll: true })
    } else {
      historyTrigger.current?.focus()
    }
  }, [historyId])

  useEffect(() => {
    if (!valid) return
    let active = true
    api.get<Report>(path).then((value) => { if (active) setReport(value) })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load contributions') })
    return () => { active = false }
  }, [path, valid])

  function open(next: Task) {
    setTask(next); setFormError(null); setName(''); setDue(''); setRequired(true)
    setAll(true); setSelected([]); setRosterSearch(''); setMethod('CASH'); setExternal(''); setReason('')
    setReference(next.kind === 'pay' ? receiptReference() : '')
    setAmount(next.kind === 'assign' ? String(next.type.default_amount) :
      next.kind === 'pay' || next.kind === 'waive' ? next.row.outstanding_amount.toFixed(2) : '')
  }

  async function save() {
    if (!task || busy) return
    setBusy(true); setFormError(null)
    try {
      let message = 'Contribution saved'
      if (task.kind === 'create') {
        await api.post(`${path}/types`, { name, default_amount: amount, due_date: due || null, is_required: required })
        message = 'Contribution created. Assign it to students next.'
      } else if (task.kind === 'assign') {
        const result = await api.post<{ assigned_count: number; already_assigned_count: number }>(`${path}/types/${task.type.id}/assign`, {
          amount_due: amount, ...(all ? { all_students: true } : { registration_ids: selected }),
        })
        message = `Assigned to ${result.assigned_count} students; ${result.already_assigned_count} already assigned.`
      } else if (task.kind === 'pay') {
        await api.post(`${path}/${task.row.id}/payments`, { amount, method, reference, external_reference: external || null })
        message = `Payment recorded · ${reference}`
      } else if (task.kind === 'waive') {
        await api.post(`${path}/${task.row.id}/waive`, { amount, reason })
        message = 'Waiver recorded'
      } else {
        await api.post(`${path}/payments/${task.payment.id}/void`, { reason })
        message = 'Payment voided; balance restored'
      }
      setTask(null)
      toast(message)
      try { setReport(await api.get<Report>(path)); setError(null) }
      catch { setError('Saved successfully, but balances could not refresh. Reload this page to see the latest amounts.') }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save. Please try again.')
    } finally { setBusy(false) }
  }

  if (!valid) return <EmptyState title="Invalid event" />
  const back = <Link className="btn btn-secondary" to="/superadmin/events"><ArrowLeft size={16} /> Events</Link>
  if (!report) return <>{back}{error ? <p className="error-text" role="alert">{error}</p> : <TableSkeleton label="Loading contributions" rows={4} columns={[{ label: 'Student', width: '70%' }]} />}</>

  const writable = report.event_status !== 'CANCELLED'
  const rows = report.contributions.filter((row) => (!typeFilter || row.type_id === Number(typeFilter)) &&
    `${row.first_name} ${row.last_name} ${row.student_number}`.toLowerCase().includes(search.trim().toLowerCase()))
  const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, lastPage)
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const historyRow = report.contributions.find((row) => row.id === historyId)
  const history = report.payments.filter((payment) => payment.contribution_id === historyId)
  const activeRoster = report.roster.filter((row) => row.registration_status === 'ACTIVE')
  const eligibleRoster = task?.kind === 'assign' ? activeRoster.filter((row) => !report.contributions.some((c) => c.registration_id === row.registration_id && c.type_id === task.type.id)) : []
  const rosterMatches = eligibleRoster.filter((row) => `${row.first_name} ${row.last_name} ${row.student_number}`.toLowerCase().includes(rosterSearch.toLowerCase()))
  const totals = report.contributions.reduce((sum, row) => ({ due: sum.due + row.amount_due, paid: sum.paid + row.paid_amount, waived: sum.waived + row.waiver_amount, balance: sum.balance + row.outstanding_amount }), { due: 0, paid: 0, waived: 0, balance: 0 })

  return <>
    <div className="contribution-nav">{back}<Link className="btn btn-secondary" to={`/superadmin/events/${eventId}/attendance`}>Attendance</Link><Link className="btn btn-secondary" to={`/superadmin/events/${eventId}/fines`}>Fines</Link></div>
    <div className="page-head"><div><h2>{report.event_name} · Contributions</h2><p>Assign event contributions and record student payments in PHP.</p></div><Button disabled={!writable || busy} onClick={() => open({ kind: 'create' })}><Plus size={16} /> Add contribution</Button></div>
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    {!writable ? <p className="muted">This event is cancelled. Contribution history is available for review.</p> : null}
    <div className="card contribution-summary"><span>Assigned <strong>{phpAmount(totals.due)}</strong></span><span>Collected <strong>{phpAmount(totals.paid)}</strong></span><span>Waived <strong>{phpAmount(totals.waived)}</strong></span><span>Remaining <strong>{phpAmount(totals.balance)}</strong></span></div>
    <div className="page-head"><div><h3>Event contributions</h3><p>Define the amount, then assign it to students. Existing assignments keep their original amounts.</p></div></div>
    {report.types.length === 0 ? <EmptyState title="No contributions yet" subtitle="Add a contribution, such as event food or materials, then assign it to the roster." /> :
      <div className="card table-card"><p className="contribution-scroll-hint muted">Scroll right for due dates, student counts, and assignment actions.</p><div className="table-wrap" tabIndex={0} role="region" aria-label="Event contribution types"><table className="data contribution-table"><thead><tr><th>Contribution</th><th>Default amount</th><th>Due date</th><th>Requirement</th><th>Students</th><th>Action</th></tr></thead><tbody>
        {report.types.map((type) => <tr key={type.id}><td><strong>{type.name}</strong></td><td>{phpAmount(type.default_amount)}</td><td>{type.due_date ?? 'No deadline'}</td><td>{type.is_required ? 'Required' : 'Optional'}</td><td>{report.contributions.filter((row) => row.type_id === type.id).length}</td><td><Button variant="secondary" disabled={!writable || busy || activeRoster.length === 0} onClick={() => open({ kind: 'assign', type })}>Assign students</Button></td></tr>)}
      </tbody></table></div></div>}
    {report.types.length > 0 && activeRoster.length === 0 ? <p className="muted">Add students using the event roster before assigning contributions.</p> : null}
    <div className="page-head contribution-section"><div><h3>Student balances</h3><p>Balances include confirmed payments. Voided payments remain in the history.</p></div></div>
    <div className="filter-bar"><div className="search"><input aria-label="Search students" placeholder="Search student or ID…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} /></div><select className="filter-control" aria-label="Filter contribution" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1) }}><option value="">All contributions</option>{report.types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></div>
    {rows.length === 0 ? <EmptyState title="No student contributions to show" subtitle={report.contributions.length ? 'Try another search or contribution.' : 'Assign a contribution to students to start recording payments.'} /> :
      <div className="card table-card"><p className="contribution-scroll-hint muted">Scroll right for balances, payment actions, and history.</p><div className="table-wrap" tabIndex={0} role="region" aria-label="Student contribution balances"><table className="data contribution-table"><thead><tr><th>Student</th><th>Contribution</th><th>Due</th><th>Paid</th><th>Waived</th><th>Balance</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visible.map((row) => <tr key={row.id}><td><strong>{row.first_name} {row.last_name}</strong><div className="muted">{row.student_number}</div></td><td>{row.name}</td><td>{phpAmount(row.amount_due)}</td><td>{phpAmount(row.paid_amount)}</td><td title={row.waiver_reason ?? undefined}>{phpAmount(row.waiver_amount)}</td><td><strong>{phpAmount(row.outstanding_amount)}</strong></td><td>{statusLabel(row.status)}</td><td><div className="contribution-actions"><Button variant="secondary" disabled={!writable || busy || row.outstanding_amount <= 0} onClick={() => open({ kind: 'pay', row })}>Record payment</Button><button type="button" className="btn btn-ghost" onClick={(event) => { historyTrigger.current = event.currentTarget; setHistoryId(row.id) }}>History</button>{row.outstanding_amount > 0 && row.waiver_amount === 0 ? <Button variant="ghost" disabled={!writable || busy} onClick={() => open({ kind: 'waive', row })}>Waive</Button> : null}</div></td></tr>)}
      </tbody></table></div><div className="table-meta pager-bar"><p className="muted">{rows.length} student contributions</p><nav className="pager" aria-label="Contribution pages"><button className="pager-btn" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {lastPage}</span><button className="pager-btn" disabled={currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>Next</button></nav></div></div>}
    {historyRow ? <section className="contribution-section" aria-label="Payment history"><div className="page-head"><div><h3 ref={historyHeading} tabIndex={-1} className="contribution-history-heading">{historyRow.first_name} {historyRow.last_name} · {historyRow.name}</h3><p>Payment history and receipt references.</p></div><Button variant="ghost" onClick={() => setHistoryId(null)}>Close history</Button></div>
      {historyRow.waiver_amount > 0 ? <p>Waived {phpAmount(historyRow.waiver_amount)} · {historyRow.waiver_reason}</p> : null}
      {history.length === 0 ? <EmptyState title="No payments recorded" /> : <div className="card table-card"><p className="contribution-scroll-hint muted">Scroll right for collector details, payment status, and void actions.</p><div className="table-wrap" tabIndex={0} role="region" aria-label="Contribution payment history"><table className="data contribution-table"><thead><tr><th>Receipt</th><th>Amount</th><th>Method</th><th>Received</th><th>Collector</th><th>Status</th><th>Action / reason</th></tr></thead><tbody>{history.map((payment) => <tr key={payment.id}><td>{payment.reference}{payment.external_reference ? <div className="muted">{payment.external_reference}</div> : null}</td><td>{phpAmount(payment.amount)}</td><td>{statusLabel(payment.method)}</td><td>{new Date(payment.received_at).toLocaleString()}</td><td>{payment.received_by}</td><td>{statusLabel(payment.status)}</td><td>{payment.status === 'CONFIRMED' ? <Button variant="ghost" disabled={!writable || busy} onClick={() => open({ kind: 'void', payment, row: historyRow })}>Void payment</Button> : <><span>{payment.void_reason}</span><div className="muted">{payment.voided_by} · {payment.voided_at ? new Date(payment.voided_at).toLocaleString() : ''}</div></>}</td></tr>)}</tbody></table></div></div>}
    </section> : null}
    {task ? <Modal title={task.kind === 'create' ? 'Add event contribution' : task.kind === 'assign' ? `Assign ${task.type.name}` : task.kind === 'pay' ? 'Record student payment' : task.kind === 'waive' ? 'Waive contribution amount' : 'Void payment'} onClose={() => { if (!busy) setTask(null) }}>
      <form onSubmit={onSubmit(save)}>
        {task.kind === 'create' ? <><Field label="Contribution name"><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Event food" /></Field><Field label="Due date (optional)"><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field><Field label="Requirement"><select value={required ? 'required' : 'optional'} onChange={(event) => setRequired(event.target.value === 'required')}><option value="required">Required</option><option value="optional">Optional</option></select></Field></> : null}
        {task.kind === 'pay' || task.kind === 'waive' || task.kind === 'void' ? <p><strong>{task.row.first_name} {task.row.last_name}</strong> · {task.row.student_number}<br />{task.row.name} · Remaining {phpAmount(task.row.outstanding_amount)}</p> : null}
        {task.kind !== 'void' ? <Field label={task.kind === 'create' ? 'Default amount (PHP)' : task.kind === 'assign' ? 'Amount per student (PHP)' : task.kind === 'waive' ? 'Amount to waive (PHP)' : 'Amount received (PHP)'}><input required type="number" min="0.01" step="0.01" max={task.kind === 'pay' || task.kind === 'waive' ? task.row.outstanding_amount : '9999999999.99'} value={amount} onChange={(event) => setAmount(event.target.value)} /></Field> : null}
        {task.kind === 'assign' ? <><Field label="Assign to"><select value={all ? 'all' : 'selected'} onChange={(event) => setAll(event.target.value === 'all')}><option value="all">Entire active roster ({activeRoster.length})</option><option value="selected">Selected students</option></select></Field><p className="muted">Students already assigned this contribution are skipped. Optional contributions should be assigned to students who opt in.</p>{!all ? <><Field label="Find students"><input value={rosterSearch} onChange={(event) => setRosterSearch(event.target.value)} placeholder="Name or student ID" /></Field><p className="muted">{selected.length} selected</p><div className="contribution-roster">{rosterMatches.length === 0 ? <p>No unassigned students match.</p> : rosterMatches.map((row) => <label className="contribution-roster-row" key={row.registration_id}><input type="checkbox" checked={selected.includes(row.registration_id)} onChange={(event) => setSelected((values) => event.target.checked ? [...values, row.registration_id] : values.filter((id) => id !== row.registration_id))} /><span>{row.first_name} {row.last_name}<small>{row.student_number}</small></span></label>)}</div></> : null}</> : null}
        {task.kind === 'pay' ? <><Field label="Payment method"><select value={method} onChange={(event) => setMethod(event.target.value)}><option value="CASH">Cash</option><option value="GCASH">GCash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="OTHER">Other</option></select></Field><Field label="Receipt reference"><input required maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} /></Field><Field label="External transaction reference (optional)"><input maxLength={100} value={external} onChange={(event) => setExternal(event.target.value)} /></Field><p className="muted">Record payments after receiving the funds. This saves a confirmed payment.</p></> : null}
        {task.kind === 'void' ? <p>Void {phpAmount(task.payment.amount)} · {task.payment.reference}. The payment stays in history and its amount returns to the balance.</p> : null}
        {task.kind === 'void' || task.kind === 'waive' ? <Field label="Reason"><textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></Field> : null}
        {formError ? <p role="alert" className="error-text">{formError}</p> : null}
        <FormActions busy={busy} onCancel={() => setTask(null)} submitLabel={task.kind === 'create' ? 'Create contribution' : task.kind === 'assign' ? 'Assign contribution' : task.kind === 'pay' ? 'Record payment' : task.kind === 'waive' ? 'Record waiver' : 'Void payment'} />
      </form>
    </Modal> : null}
  </>
}
