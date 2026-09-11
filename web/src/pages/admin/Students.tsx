import { useEffect, useId, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import { Button, EmptyState, Field, Modal, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtYearLevel } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { ImportResult, Student, StudentPage } from '../../lib/types'

const csvTemplate =
  'StudentID,FName,LName,MName,COURSE,YrLevel,Sectioning\n' +
  '02-26-0999,Juan,Dela Cruz,Santos,BSIT,1st Year,A\n' +
  '02-26-1000,Maria,Clara,,BSBA,1st Year,B'

const PAGE_SIZE = 10

export function AdminStudents() {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [students, setStudents] = useState<Student[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Student | 'new' | null>(null)
  const [qr, setQr] = useState<Student | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  const debounced = useDebounced(query, 350)

  async function load(q = debounced, p = page) {
    try {
      const data = await api.get<StudentPage>('/admin/students', {
        q: q.trim() || undefined,
        page: p,
        per_page: PAGE_SIZE,
      })
      if (data.students.length === 0 && data.total > 0 && p > 1) {
        setPage(Math.max(1, Math.ceil(data.total / data.per_page)))
        return
      }
      setStudents(data.students)
      setTotal(data.total)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load students')
    }
  }

  useEffect(() => {
    void load(debounced, page)
  }, [debounced, page])

  async function remove(s: Student) {
    if (!window.confirm(`Delete ${s.full_name}? Their attendance records will also be deleted.`)) return
    try {
      await api.delete(`/admin/students/${s.id}`)
      toast('Student deleted')
      if ((students?.length ?? 0) === 1 && page > 1) {
        setPage(page - 1)
      } else {
        await load()
      }
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
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
          placeholder="Search name, code or section"
        />
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      {students === null && !error ? (
        <p className="loading">Loading students…</p>
      ) : students && students.length === 0 ? (
        <EmptyState
          title={query ? 'No matches' : 'No students yet'}
          subtitle={query ? undefined : 'Add students one by one or import a spreadsheet.'}
        />
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data students-table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>First name</th>
                  <th>Middle name</th>
                  <th>Last name</th>
                  <th>Course</th>
                  <th>Year level</th>
                  <th>Sectioning</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(students ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.student_id_code}</td>
                    <td>
                      <strong>{s.first_name || s.full_name}</strong>
                    </td>
                    <td className="muted">{s.middle_name || '—'}</td>
                    <td>{s.last_name || '—'}</td>
                    <td className="muted">{s.course || '—'}</td>
                    <td className="muted">{fmtYearLevel(s.year_level)}</td>
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
            <StudentPager
              page={page}
              perPage={PAGE_SIZE}
              total={total}
              onPage={setPage}
            />
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
  const [file, setFile] = useState<File | null>(null)
  const [skip, setSkip] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function run() {
    if (!file && !csv.trim()) {
      toast('Upload a spreadsheet or paste CSV first', 'error')
      return
    }
    setBusy(true)
    try {
      const query = skip ? { mode: 'skip' } : undefined
      const name = file?.name.toLowerCase() ?? ''
      const isExcel = name.endsWith('.xls') || name.endsWith('.xlsx')
      const res = isExcel && file
        ? await api.postRaw<ImportResult>(
            '/admin/students/import',
            await file.arrayBuffer(),
            name.endsWith('.xlsx')
              ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              : 'application/vnd.ms-excel',
            query,
          )
        : await api.post<ImportResult>(
            '/admin/students/import',
            { csv: file ? await file.text() : csv },
            query,
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
        Use the school roster headers from <code>sample_data.xls</code>: StudentID, FName, LName,
        MName, COURSE, YrLevel, Sectioning. Extra columns (USN, IDAdmission, SYCode, Acronym,
        AStatus, Datelog, AdmissionYrLevel, ScheduleType, LearningMode) are ignored. You can upload
        the .xls/.xlsx file or paste CSV with that header row.
      </p>
      <FilePick file={file} onFile={setFile} disabled={busy} />
      <Field label="Or paste CSV">
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

const rosterAccept =
  '.xls,.xlsx,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function isRosterFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')
}

function fileKind(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.xlsx')) return 'XLSX'
  if (lower.endsWith('.xls')) return 'XLS'
  if (lower.endsWith('.csv')) return 'CSV'
  return 'File'
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FilePick({
  file,
  onFile,
  disabled,
}: {
  file: File | null
  onFile: (file: File | null) => void
  disabled?: boolean
}) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [over, setOver] = useState(false)

  function take(next: File | null) {
    if (!next) {
      onFile(null)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (!isRosterFile(next)) {
      toast('Use an .xls, .xlsx, or .csv roster file', 'error')
      return
    }
    onFile(next)
  }

  return (
    <div className="field">
      <span id={`${inputId}-label`}>Roster file</span>
      <input
        id={inputId}
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept={rosterAccept}
        disabled={disabled}
        onChange={(e) => take(e.target.files?.[0] ?? null)}
      />
      <div
        className={`file-pick${over ? ' is-over' : ''}${file ? ' is-filled' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return
          setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (!disabled) take(e.dataTransfer.files[0] ?? null)
        }}
      >
        <button
          type="button"
          className="file-pick-well"
          disabled={disabled}
          aria-labelledby={`${inputId}-label`}
          aria-describedby={`${inputId}-hint`}
          onClick={() => inputRef.current?.click()}
        >
          <span className="icon-badge" aria-hidden="true">
            <FileSpreadsheet size={20} />
          </span>
          <span className="file-pick-copy">
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span id={`${inputId}-hint`}>
                  {fileKind(file.name)} · {fileSize(file.size)} · click to replace
                </span>
              </>
            ) : (
              <>
                <strong>Drop the school roster here</strong>
                <span id={`${inputId}-hint`}>.xls, .xlsx, or .csv</span>
              </>
            )}
          </span>
          <span className="btn btn-secondary btn-sm file-pick-cta" aria-hidden="true">
            {file ? 'Replace file' : 'Choose file'}
          </span>
        </button>
        {file ? (
          <button
            type="button"
            className="icon-btn file-pick-clear"
            disabled={disabled}
            aria-label={`Remove ${file.name}`}
            onClick={() => take(null)}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function StudentPager({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number
  perPage: number
  total: number
  onPage: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)

  return (
    <div className="table-meta pager-bar">
      <p className="muted">
        Showing {from}–{to} of {total} student{total === 1 ? '' : 's'}
      </p>
      {totalPages > 1 ? (
        <nav className="pager" aria-label="Students pages">
          <button
            type="button"
            className="pager-btn"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          {pageItems(page, totalPages).map((item, i) =>
            item === 'ellipsis' ? (
              <span key={`e-${i}`} className="pager-ellipsis">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`pager-btn${item === page ? ' is-current' : ''}`}
                onClick={() => onPage(item)}
                aria-current={item === page ? 'page' : undefined}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className="pager-btn"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
        </nav>
      ) : null}
    </div>
  )
}

function pageItems(current: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const set = new Set<number>([1, totalPages])
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= totalPages) set.add(p)
  }
  const sorted = [...set].sort((a, b) => a - b)
  const items: Array<number | 'ellipsis'> = []
  for (const p of sorted) {
    const prev = items[items.length - 1]
    if (typeof prev === 'number' && p - prev > 1) items.push('ellipsis')
    items.push(p)
  }
  return items
}

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return v
}
