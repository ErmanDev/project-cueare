import { useEffect, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'

import { Button, CardListSkeleton, EmptyState, Field, FormActions, Modal, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { initial } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { Student, StudentPage, User } from '../../lib/types'

type Student = {
  id: number
  student_id_code?: string | null
  full_name: string
  section?: string | null
  user_id?: number | null
}

type StudentPage = {
  students: Student[]
  total: number
}

export function AdminModerators() {
  const { toast } = useToast()
  const [list, setList] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<User | 'new' | null>(null)

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

  async function demote(m: User) {
    if (!window.confirm(`Demote ${m.name} to student? They will sign in as a student again.`)) {
      return
    }
    try {
      await api.post(`/admin/moderators/${m.id}/demote`)
      toast('Demoted to student')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Demote failed', 'error')
    }
  }

  async function remove(m: User) {
    if (!window.confirm(`Delete moderator "${m.name}"?`)) return
    try {
      await api.delete(`/admin/moderators/${m.id}`)
      toast('Moderator deleted')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Moderators</h2>
          <p>Users who can scan attendance and manage sessions.</p>
        </div>
        <Button onClick={() => setForm('new')}>
          <Plus size={18} /> Add moderator
        </Button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {list === null ? (
        <CardListSkeleton label="Loading moderators" count={3} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No moderators yet"
          subtitle="Add a moderator to let them scan attendance."
        />
      ) : (
        <div className="mod-grid">
          {list.map((m) => (
            <article key={m.id} className="card mod-card">
              <div className="mod-avatar">{initial(m.name)}</div>
              <div className="mod-info">
                <h3>{m.name}</h3>
                <p className="muted">@{m.username}</p>
              </div>
              <button className="icon-btn edit-btn" title="Edit" onClick={() => setForm(m)}>
                <Pencil size={18} />
              </button>
              <button className="icon-btn danger-btn" title="Delete" onClick={() => remove(m)}>
                <Trash2 size={18} />
              </button>
            </article>
          ))}
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
      {form && form !== 'new' ? (
        <ModeratorEditForm
          existing={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            void load()
          }}
        />
      ) : null}
    </>
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
      <p className="muted">
        Search a student, then promote them to moderator. They sign in with their student ID as
        username and password until you change it.
      </p>
      <div className="search">
        <Search size={16} />
        <input
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
