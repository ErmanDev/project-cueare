import { useEffect, useState } from 'react'
import { Pencil, Plus, QrCode, Search, Trash2, Upload } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import { Button, EmptyState, Field, Modal, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { initial } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { ImportResult, Student } from '../../lib/types'

const csvTemplate =
  'student_id_code,full_name,section\nSTU-2026-0001,Juan Dela Cruz,BSIT-3A\nSTU-2026-0002,Maria Clara,BSIT-3B'

export function AdminStudents() {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<Student[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Student | 'new' | null>(null)
  const [qr, setQr] = useState<Student | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const debounced = useDebounced(query, 350)

  async function load(q = debounced) {
    try {
      const list = await api.get<Student[]>('/admin/students', q.trim() ? { q: q.trim() } : undefined)
      setStudents(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load students')
    }
  }

  useEffect(() => {
    void load(debounced)
  }, [debounced])

  async function remove(s: Student) {
    if (!window.confirm(`Delete ${s.full_name}? Their attendance records will also be deleted.`)) return
    try {
      await api.delete(`/admin/students/${s.id}`)
      toast('Student deleted')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Students</h2>
          <p>Add, import, edit, and view QR codes</p>
        </div>
        <div className="toolbar">
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Bulk import
          </Button>
          <Button onClick={() => setForm('new')}>
            <Plus size={18} /> Add student
          </Button>
        </div>
      </div>
      <div className="search">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, code or section"
        />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {students === null && !error ? (
        <p className="loading">Loading students…</p>
      ) : students && students.length === 0 ? (
        <EmptyState
          title={query ? 'No matches' : 'No students yet'}
          subtitle={query ? undefined : 'Add students one by one or import a CSV.'}
        />
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Code</th>
                  <th>Section</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(students ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="row">
                        <div className="avatar">{initial(s.full_name)}</div>
                        <strong>{s.full_name}</strong>
                      </div>
                    </td>
                    <td>{s.student_id_code}</td>
                    <td className="muted">{s.section ?? '—'}</td>
                    <td>
                      <div className="menu end">
                        <button className="icon-btn" title="Show QR" onClick={() => setQr(s)}>
                          <QrCode size={16} />
                        </button>
                        <button className="icon-btn" title="Edit" onClick={() => setForm(s)}>
                          <Pencil size={16} />
                        </button>
                        <button className="icon-btn" title="Delete" onClick={() => void remove(s)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {students ? (
            <p className="muted table-meta">
              {students.length} student{students.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      )}
      {form ? (
        <StudentForm
          existing={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            setForm(null)
            void load()
            if (saved) setQr(saved)
          }}
        />
      ) : null}
      {qr ? (
        <Modal title={qr.full_name} onClose={() => setQr(null)}>
          <p className="muted qr-meta">
            {[qr.student_id_code, qr.section].filter(Boolean).join(' · ')}
          </p>
          <div className="qr-stage">
            <QRCodeSVG value={qr.qr_payload || qr.student_id_code} size={220} />
          </div>
          <div className="actions">
            <Button onClick={() => setQr(null)}>Close</Button>
          </div>
        </Modal>
      ) : null}
      {importOpen ? (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false)
            void load()
          }}
        />
      ) : null}
    </>
  )
}

function StudentForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: Student | null
  onClose: () => void
  onSaved: (saved?: Student) => void
}) {
  const { toast } = useToast()
  const isEdit = existing != null
  const [code, setCode] = useState(existing?.student_id_code ?? '')
  const [name, setName] = useState(existing?.full_name ?? '')
  const [section, setSection] = useState(existing?.section ?? '')
  const [photo, setPhoto] = useState(existing?.photo_url ?? '')
  const [busy, setBusy] = useState(false)

  async function save(showQr: boolean) {
    setBusy(true)
    try {
      const body = {
        student_id_code: code.trim(),
        full_name: name.trim(),
        section: section.trim() || null,
        photo_url: photo.trim() || null,
      }
      const saved = isEdit
        ? await api.put<Student>(`/admin/students/${existing.id}`, body)
        : await api.post<Student>('/admin/students', body)
      toast(isEdit ? 'Student saved' : 'Student created')
      onSaved(showQr ? saved : undefined)
      if (!showQr) onClose()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit student' : 'New student'} onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit(() => save(false))}>
        <Field label="Student code">
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="STU-2026-0001" required />
        </Field>
        <Field label="Full name">
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Section (optional)">
          <input value={section} onChange={(e) => setSection(e.target.value)} />
        </Field>
        <Field label="Photo URL (optional)">
          <input value={photo} onChange={(e) => setPhoto(e.target.value)} />
        </Field>
        <div className="actions">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>
            Save & show QR
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { toast } = useToast()
  const [csv, setCsv] = useState('')
  const [skip, setSkip] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function run() {
    if (!csv.trim()) {
      toast('Paste some CSV first', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await api.post<ImportResult>(
        '/admin/students/import',
        { csv },
        skip ? { mode: 'skip' } : undefined,
      )
      setResult(res)
      toast('Import finished')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Bulk import students" onClose={onClose} wide>
      <p className="muted copy-block">
        Paste CSV with a header row. Columns: student_id_code, full_name, section (optional),
        photo_url (optional).
      </p>
      <Field label="CSV">
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={csvTemplate} />
      </Field>
      <label className="row check-row">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
        Skip existing codes instead of updating them
      </label>
      {result ? (
        <p className="muted check-row">
          Created {result.created ?? 0} · updated {result.updated ?? 0} · skipped {result.skipped ?? 0}
          {result.errors?.length ? ` · ${result.errors.length} errors` : ''}
        </p>
      ) : null}
      <div className="actions">
        <Button variant="ghost" onClick={result ? onImported : onClose}>
          {result ? 'Done' : 'Cancel'}
        </Button>
        <Button variant="secondary" onClick={() => setCsv(csvTemplate)}>
          Insert template
        </Button>
        <Button onClick={() => void run()} disabled={busy}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
      </div>
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
