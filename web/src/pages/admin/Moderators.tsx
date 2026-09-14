import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button, CardListSkeleton, EmptyState, Field, FormActions, Modal, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { initial } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { User } from '../../lib/types'

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

  async function remove(m: User) {
    if (
      !window.confirm(
        `Delete ${m.name}? Moderators who have already scanned cannot be deleted — reset their password instead.`,
      )
    ) {
      return
    }
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
          <p>Accounts that scan attendance</p>
        </div>
        <Button onClick={() => setForm('new')}>
          <Plus size={18} /> Add moderator
        </Button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {list === null && !error ? (
        <CardListSkeleton label="Loading moderators" />
      ) : list && list.length === 0 ? (
        <EmptyState
          title="No moderators yet"
          subtitle="Promote a student, or create a special ID and password."
        />
      ) : (
        <div className="list">
          {(list ?? []).map((m) => (
            <article key={m.id} className="card row">
              <div className="avatar">{initial(m.name)}</div>
              <div className="grow">
                <strong>{m.name}</strong>
                <p className="muted">@{m.username}</p>
              </div>
              <button className="icon-btn" title="Edit" onClick={() => setForm(m)}>
                <Pencil size={16} />
              </button>
              <button className="icon-btn" title="Delete" onClick={() => void remove(m)}>
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      )}
      {form ? (
        <ModeratorForm
          existing={form === 'new' ? null : form}
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
  const [mode, setMode] = useState<'student' | 'special'>('student')

  return (
    <Modal title="Add moderator" onClose={onClose}>
      <div className="segmented" role="tablist" aria-label="How to add a moderator">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'student'}
          className={mode === 'student' ? 'active' : ''}
          onClick={() => setMode('student')}
        >
          Promote student
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'special'}
          className={mode === 'special' ? 'active' : ''}
          onClick={() => setMode('special')}
        >
          Create special ID
        </button>
      </div>
      {mode === 'student' ? (
        <PromoteStudentForm onClose={onClose} onSaved={onSaved} />
      ) : (
        <CreateSpecialModeratorForm onClose={onClose} onSaved={onSaved} />
      )}
    </Modal>
  )
}

function PromoteStudentForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 350)
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
    <>
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
    </>
  )
}

function CreateSpecialModeratorForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (password.length < 4) {
      toast('Password must be at least 4 characters', 'error')
      return
    }
    setBusy(true)
    try {
      await api.post('/admin/moderators', {
        name: name.trim(),
        username: username.trim(),
        password,
      })
      toast('Moderator created')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create moderator', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit(save)}>
      <p className="muted">
        Create a login that is not already used. To use a student ID, switch to Promote student
        and fetch them first.
      </p>
      <Field label="Full name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoFocus
          autoComplete="off"
        />
      </Field>
      <Field label="Special ID">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          maxLength={100}
          autoComplete="off"
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={4}
          autoComplete="new-password"
        />
      </Field>
      <FormActions onCancel={onClose} submitLabel="Create moderator" busy={busy} />
    </form>
  )
}

function ModeratorEditForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: User | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isEdit = existing != null
  const [name, setName] = useState(existing?.name ?? '')
  const [username, setUsername] = useState(existing?.username ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!isEdit && password.length < 4) {
      toast('Password must be at least 4 characters', 'error')
      return
    }
    if (isEdit && password && password.length < 4) {
      toast('Password must be at least 4 characters', 'error')
      return
    }
    setBusy(true)
    try {
      if (isEdit) {
        await api.put(`/admin/moderators/${existing.id}`, {
          name: name.trim(),
          username: username.trim(),
          ...(password ? { password } : {}),
        })
      } else {
        await api.post('/admin/moderators', {
          name: name.trim(),
          username: username.trim(),
          password,
        })
      }
      toast(isEdit ? 'Moderator saved' : 'Moderator created')
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit moderator' : 'New moderator'} onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit(save)}>
        <Field label="Full name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" />
        </Field>
        <Field label={isEdit ? 'New password (leave blank to keep)' : 'Password'}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            autoComplete="new-password"
          />
        </Field>
        <FormActions onCancel={onClose} submitLabel={isEdit ? 'Save' : 'Create'} busy={busy} />
      </form>
    </Modal>
  )
}
