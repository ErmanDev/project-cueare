import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button, EmptyState, Field, FormActions, Modal, onSubmit } from '../../components/ui'
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
        <p className="loading">Loading moderators…</p>
      ) : list && list.length === 0 ? (
        <EmptyState
          title="No moderators yet"
          subtitle="Moderators are the accounts that scan QR codes."
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

function ModeratorForm({
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
