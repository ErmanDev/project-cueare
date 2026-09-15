import { useEffect, useId, useMemo, useState } from 'react'
import { Pencil, Plus, Search, UserMinus, X } from 'lucide-react'

import { Button, ConfirmDialog, EmptyState, Field, FormActions, Modal, TableSkeleton, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { initial } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { Student, StudentPage, User } from '../../lib/types'

type AccountFilter = 'all' | 'student' | 'staff'

export function AdminModerators() {
  const { toast } = useToast()
  const searchId = useId()
  const [list, setList] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<User | 'new' | null>(null)
  const [pendingDemote, setPendingDemote] = useState<User | null>(null)
  const [demoting, setDemoting] = useState(false)
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all')

  async function load() {
    try {
      const rows = await api.get<User[]>('/admin/moderators')
      setList(rows)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load moderators')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function confirmDemote() {
    const m = pendingDemote
    if (!m || demoting) return
    setDemoting(true)
    try {
      await api.post(`/admin/moderators/${m.id}/demote`)
      toast('Demoted to student')
      setPendingDemote(null)
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Demote failed', 'error')
    } finally {
      setDemoting(false)
    }
  }

  const filtered = useMemo(() => {
    if (!list) return []
    const needle = query.trim().toLowerCase()
    return list.filter((m) => {
      if (accountFilter === 'student' && !m.student_id) return false
      if (accountFilter === 'staff' && m.student_id) return false
      if (!needle) return true
      return m.name.toLowerCase().includes(needle) || m.username.toLowerCase().includes(needle)
    })
  }, [list, query, accountFilter])

  const filtering = Boolean(query.trim()) || accountFilter !== 'all'

  function clearFilters() {
    setQuery('')
    setAccountFilter('all')
  }

  return (
    <div className="moderators-page">
      <div className="page-head">
        <div>
          <h2>Moderators</h2>
          <p>Users who can scan attendance and manage sessions.</p>
        </div>
        <Button onClick={() => setForm('new')}>
          <Plus size={18} /> Add moderator
        </Button>
      </div>

      <div className="filter-bar">
        <div className="search">
          <label className="visually-hidden" htmlFor={searchId}>
            Search moderators
          </label>
          <Search size={16} aria-hidden />
          <input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or username"
          />
          {query ? (
            <button type="button" className="icon-btn" onClick={() => setQuery('')} title="Clear search">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <div className="segmented" role="group" aria-label="Account type">
          {(
            [
              ['all', 'All'],
              ['student', 'Student'],
              ['staff', 'Staff'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={accountFilter === key ? 'active' : ''}
              onClick={() => setAccountFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {list === null ? (
        <TableSkeleton
          label="Loading moderators"
          tableClass="moderators-table"
          rows={6}
          meta={false}
          columns={[
            { label: 'Name', width: '70%' },
            { label: 'Username', width: '48%' },
            { label: 'Account', width: '36%' },
            { label: 'Actions', variant: 'actions', count: 2 },
          ]}
        />
      ) : list.length === 0 ? (
        <EmptyState
          title="No moderators yet"
          subtitle="Add a moderator to let them scan attendance."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          subtitle="Try a different name, username, or account type."
          action={
            filtering ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data moderators-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Account</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong className="cell-name">{m.name}</strong>
                    </td>
                    <td>@{m.username}</td>
                    <td className="muted">{m.student_id ? 'Student account' : 'Staff account'}</td>
                    <td>
                      <div className="menu end">
                        <button className="icon-btn" title="Edit" onClick={() => setForm(m)}>
                          <Pencil size={16} />
                        </button>
                        {m.student_id ? (
                          <button
                            className="icon-btn"
                            type="button"
                            title="Demote to student"
                            onClick={() => setPendingDemote(m)}
                          >
                            <UserMinus size={16} />
                            <span className="visually-hidden">Demote to student</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtering ? (
            <p className="muted table-meta">
              Showing {filtered.length} of {list.length}
            </p>
          ) : null}
        </div>
      )}
      {form === 'new' ? (
        <AddModeratorForm
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            void load()
          }}
        />
      ) : form ? (
        <ModeratorEditForm
          existing={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            void load()
          }}
        />
      ) : null}
      {pendingDemote ? (
        <ConfirmDialog
          title="Demote to student?"
          message={`${pendingDemote.name} will sign in as a student again.`}
          confirmLabel="Demote to student"
          busy={demoting}
          onCancel={() => {
            if (!demoting) setPendingDemote(null)
          }}
          onConfirm={() => void confirmDemote()}
        />
      ) : null}
    </div>
  )
}

function AddModeratorForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 350)
    return () => clearTimeout(timer)
  }, [query])
  const [students, setStudents] = useState<Student[] | null>(null)
  const [selected, setSelected] = useState<Student | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function search() {
      try {
        const data = await api.get<StudentPage>('/admin/students', {
          q: debounced.trim() || undefined,
          page: 1,
          per_page: 8,
        })
        if (cancelled) return
        setStudents(data.students)
        setSelected((current) =>
          current && data.students.some((s) => s.id === current.id) ? current : null,
        )
      } catch {
        if (!cancelled) setStudents([])
      }
    }
    void search()
    return () => {
      cancelled = true
    }
  }, [debounced])

  async function promote() {
    if (!selected || selected.user_id) return
    setBusy(true)
    try {
      await api.post('/admin/moderators/from-student', { student_id: selected.id })
      toast(`${selected.full_name} is now a moderator`)
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not make moderator', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add moderator" onClose={onClose}>
      <div className="add-moderator">
        <p className="muted add-moderator-lead">
          Search a student, then promote them to moderator. They sign in with their student ID as
          username and password until you change it.
        </p>
        <div className="search">
          <label className="visually-hidden" htmlFor={searchId}>
            Search students
          </label>
          <Search size={16} aria-hidden />
          <input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or student ID"
            autoFocus
          />
        </div>
        {students === null ? (
          <p className="muted">Searching…</p>
        ) : students.length === 0 ? (
          <EmptyState title="No matching students" />
        ) : (
          <div className="pick-list">
            {students.map((s) => {
              const already = s.user_id != null
              const picked = selected?.id === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`card row pick-btn${picked ? ' is-picked' : ''}`}
                  disabled={already}
                  onClick={() => setSelected(s)}
                >
                  <div className="avatar">{initial(s.full_name)}</div>
                  <div className="grow">
                    <strong>{s.full_name}</strong>
                    <p className="muted">
                      {already ? `${s.student_id_code} · already a moderator` : s.student_id_code}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <div className="actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void promote()} disabled={!selected || !!selected.user_id || busy}>
            {busy ? 'Saving…' : 'Promote moderator'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ModeratorEditForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: User
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(existing.name)
  const [username, setUsername] = useState(existing.username)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (password && password.length < 4) {
      toast('Password must be at least 4 characters', 'error')
      return
    }
    setBusy(true)
    try {
      await api.put(`/admin/moderators/${existing.id}`, {
        name: name.trim(),
        username: username.trim(),
        ...(password ? { password } : {}),
      })
      toast('Moderator saved')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Edit moderator" onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit(save)}>
        <Field label="Full name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
        </Field>
        <Field label="New password (leave blank to keep)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <FormActions onCancel={onClose} submitLabel="Save" busy={busy} />
      </form>
    </Modal>
  )
}

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}
