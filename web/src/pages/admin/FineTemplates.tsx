import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Button, EmptyState, Field, FormActions, Modal, TableSkeleton, onSubmit } from '../../components/ui'
import { api } from '../../lib/api'
import { phpAmount } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { FineTemplate, FineTemplateRule } from '../../lib/types'

const SESSION_TYPES = ['GENERAL', 'AM', 'PM'] as const
const VIOLATIONS = ['ABSENT', 'LATE', 'MISSED_CHECKOUT'] as const

const defaultRules: FineTemplateRule[] = [
  { session_type_code: 'GENERAL', violation_code: 'ABSENT', fine_amount: 100, priority_order: 100 },
  { session_type_code: 'GENERAL', violation_code: 'LATE', fine_amount: 50, priority_order: 100 },
  { session_type_code: 'GENERAL', violation_code: 'MISSED_CHECKOUT', fine_amount: 50, priority_order: 100 },
]

function slugCode(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return slug || 'FINE-POLICY'
}

function sessionLabel(code: string): string {
  if (code === 'GENERAL') return 'General'
  return code
}

function violationLabel(code: string): string {
  if (code === 'MISSED_CHECKOUT') return 'Missed checkout'
  if (code === 'ABSENT') return 'Absent'
  if (code === 'LATE') return 'Late'
  return code.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function versionStatusLabel(code: string | null | undefined): string {
  if (code === 'PUBLISHED') return 'Published'
  if (code === 'RETIRED') return 'Retired'
  if (!code) return 'No version'
  return 'Draft'
}

function versionChipClass(code: string | null | undefined): string {
  if (code === 'PUBLISHED') return 'chip chip-active'
  if (code === 'RETIRED') return 'chip chip-inactive'
  if (code === 'DRAFT') return 'chip chip-draft'
  return 'chip chip-window'
}

function isKnownSession(code: string): boolean {
  return (SESSION_TYPES as readonly string[]).includes(code)
}

function isKnownViolation(code: string): boolean {
  return (VIOLATIONS as readonly string[]).includes(code)
}

function nextRule(existing: FineTemplateRule[]): FineTemplateRule {
  for (const session of SESSION_TYPES) {
    for (const violation of VIOLATIONS) {
      if (!existing.some((r) => r.session_type_code === session && r.violation_code === violation)) {
        const sibling = existing.find((r) => r.violation_code === violation)
        return {
          session_type_code: session,
          violation_code: violation,
          fine_amount: sibling?.fine_amount ?? 0,
          priority_order: 100,
        }
      }
    }
  }
  return { session_type_code: '', violation_code: '', fine_amount: 0, priority_order: 100 }
}

export function AdminFineTemplates() {
  const { toast } = useToast()
  const [templates, setTemplates] = useState<FineTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<FineTemplate | 'new' | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  async function load() {
    try {
      const list = await api.get<FineTemplate[]>('/admin/fine-templates')
      setTemplates(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load fine templates')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function toggleActive(t: FineTemplate) {
    if (togglingId != null) return
    setTogglingId(t.template_id)
    try {
      await api.put(`/admin/fine-templates/${t.template_id}`, { is_active: !t.is_active })
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update status', 'error')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Fine templates</h2>
          <p>Reusable PHP rates for absence, lateness, and missed checkout</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} /> New template
        </Button>
      </div>
      {templates === null && !error ? (
        <TableSkeleton
          label="Loading fine templates"
          tableClass="fines-table"
          rows={5}
          columns={[
            { label: 'Template', width: '42%' },
            { label: 'Version', variant: 'chip', width: 120 },
            { label: 'Rates', variant: 'chips' },
            { label: 'Max / student', width: 88 },
            { label: 'Status', variant: 'chip', width: 72 },
            { label: '', variant: 'actions', count: 1 },
          ]}
        />
      ) : error && templates === null ? (
        <EmptyState
          title="Couldn’t load templates"
          subtitle={error}
          action={
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : templates && templates.length === 0 ? (
        <EmptyState
          title="No fine templates yet"
          subtitle="Create a template once, then apply it to events instead of re-entering rates."
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus size={18} /> New template
            </Button>
          }
        />
      ) : (
        <div className="card table-card">
          {error ? <p className="error-text table-banner">{error}</p> : null}
          <div className="table-wrap">
            <table className="data fines-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Version</th>
                  <th>Rates</th>
                  <th className="cell-num">Max / student</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(templates ?? []).map((t) => {
                  const rules = t.active_version?.rules ?? []
                  const status = t.active_version?.version_status_code
                  return (
                    <tr key={t.template_id}>
                      <td>
                        <strong className="cell-name">{t.template_name}</strong>
                        <p className="muted">{t.template_code}</p>
                      </td>
                      <td>
                        <span className={versionChipClass(status)}>
                          {status
                            ? `v${t.active_version?.version_number} · ${versionStatusLabel(status)}`
                            : versionStatusLabel(status)}
                        </span>
                      </td>
                      <td>
                        {rules.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="windows">
                            {rules.map((r) => (
                              <span
                                key={`${r.session_type_code}-${r.violation_code}-${r.priority_order}`}
                                className="chip chip-window"
                              >
                                {sessionLabel(r.session_type_code)} · {violationLabel(r.violation_code)} ·{' '}
                                {phpAmount(r.fine_amount)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="cell-num">{phpAmount(t.active_version?.max_fine_per_student)}</td>
                      <td>
                        <button
                          type="button"
                          className={t.is_active ? 'chip chip-active' : 'chip chip-inactive'}
                          aria-pressed={t.is_active}
                          disabled={togglingId === t.template_id}
                          title={t.is_active ? 'Mark inactive' : 'Mark active'}
                          onClick={() => void toggleActive(t)}
                        >
                          {t.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        <div className="menu end">
                          <button
                            className="icon-btn"
                            title="Edit"
                            aria-label={`Edit ${t.template_name}`}
                            onClick={() => setEditing(t)}
                          >
                            <Pencil size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {templates ? (
            <p className="muted table-meta">
              {templates.length} template{templates.length === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
      )}
      {editing ? (
        <FineTemplateForm
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      ) : null}
    </>
  )
}

function FineTemplateForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: FineTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const isEdit = existing != null
  const published = existing?.active_version?.version_status_code === 'PUBLISHED'
  const [name, setName] = useState(existing?.template_name ?? '')
  const [code, setCode] = useState(existing?.template_code ?? '')
  const [codeTouched, setCodeTouched] = useState(isEdit)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [maxFine, setMaxFine] = useState(
    existing?.active_version?.max_fine_per_student != null
      ? String(existing.active_version.max_fine_per_student)
      : '500',
  )
  const [publish, setPublish] = useState(existing?.active_version?.version_status_code !== 'DRAFT')
  const [active, setActive] = useState(existing?.is_active ?? true)
  const [rules, setRules] = useState<FineTemplateRule[]>(
    existing?.active_version?.rules.length ? existing.active_version.rules : defaultRules,
  )
  const [busy, setBusy] = useState(false)

  const nextVersion = useMemo(() => {
    const current = existing?.active_version?.version_number ?? 0
    if (!isEdit) return 1
    if (published) return current + 1
    return current || 1
  }, [existing, isEdit, published])

  function setRule(index: number, patch: Partial<FineTemplateRule>) {
    setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function save() {
    if (!name.trim()) {
      toast('Enter a template name', 'error')
      return
    }
    const templateCode = (isEdit ? existing.template_code : code || slugCode(name)).trim().toUpperCase()
    if (!templateCode) {
      toast('Enter a template code', 'error')
      return
    }
    if (rules.length === 0) {
      toast('Add at least one rate', 'error')
      return
    }
    for (const r of rules) {
      if (!r.session_type_code.trim() || !r.violation_code.trim()) {
        toast('Every rate needs a session type and a violation', 'error')
        return
      }
      if (!Number.isFinite(r.fine_amount) || r.fine_amount < 0) {
        toast('Fine amounts must be 0 or more', 'error')
        return
      }
    }
    const pairs = new Set<string>()
    for (const r of rules) {
      const key = `${r.session_type_code}|${r.violation_code}`
      if (pairs.has(key)) {
        toast(`Duplicate rate for ${sessionLabel(r.session_type_code)} ${violationLabel(r.violation_code)}`, 'error')
        return
      }
      pairs.add(key)
    }
    const cap = maxFine.trim() === '' ? null : Number(maxFine)
    if (cap != null && (!Number.isFinite(cap) || cap < 0)) {
      toast('Maximum per student must be 0 or more', 'error')
      return
    }
    setBusy(true)
    try {
      await api.post('/admin/fine-templates/upsert', {
        template_code: templateCode,
        template_name: name.trim(),
        description: description.trim() || null,
        version_number: nextVersion,
        currency_code: 'PHP',
        maximum_fine_per_student: cap,
        publish,
        is_active: active,
        rules: rules.map((r, i) => ({
          session_type_code: r.session_type_code.trim().toUpperCase(),
          violation_code: r.violation_code.trim().toUpperCase(),
          fine_amount: r.fine_amount,
          priority_order: r.priority_order || 100 + i,
        })),
      })
      toast(
        isEdit
          ? publish
            ? `Published v${nextVersion}`
            : `Saved v${nextVersion} as draft`
          : 'Template created',
      )
      onSaved()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save template', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={isEdit ? 'Edit fine template' : 'New fine template'} onClose={onClose} wide>
      <form className="form-grid fine-form" onSubmit={onSubmit(save)}>
        <Field label="Template name">
          <input
            value={name}
            onChange={(e) => {
              const next = e.target.value
              setName(next)
              if (!codeTouched) setCode(slugCode(next))
            }}
            required
            autoComplete="off"
            autoFocus={!isEdit}
          />
        </Field>
        <div className="grid-2">
          <Field label="Code">
            <input
              value={code}
              onChange={(e) => {
                setCodeTouched(true)
                setCode(e.target.value.toUpperCase())
              }}
              required
              disabled={isEdit}
              autoComplete="off"
              title={isEdit ? 'Code cannot change after the template is created' : undefined}
              aria-describedby={isEdit ? 'fine-code-hint' : undefined}
            />
            {isEdit ? (
              <span className="field-note" id="fine-code-hint">
                Can’t change after create.
              </span>
            ) : null}
          </Field>
          <Field label="Max per student (₱)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={maxFine}
              onChange={(e) => setMaxFine(e.target.value)}
              placeholder="No cap"
            />
          </Field>
        </div>
        <Field label="Description">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="Optional"
          />
        </Field>
        <div className="grid-2">
          <Field label="Status">
            <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
          <Field label="Version">
            <select value={publish ? '1' : '0'} onChange={(e) => setPublish(e.target.value === '1')}>
              <option value="1">Publish v{nextVersion}</option>
              <option value="0">Save v{nextVersion} as draft</option>
            </select>
            {published ? (
              <span className="field-note">v{existing.active_version?.version_number} stays published.</span>
            ) : null}
          </Field>
        </div>
        <div className="row">
          <strong className="grow">Rates</strong>
          <Button
            variant="secondary"
            className="btn-sm"
            disabled={busy}
            onClick={() => setRules((rs) => [...rs, nextRule(rs)])}
          >
            <Plus size={14} /> Add
          </Button>
        </div>
        {rules.length === 0 ? (
          <p className="muted">Add at least one rate before saving.</p>
        ) : null}
        {rules.map((r, i) => {
          const customSession = !isKnownSession(r.session_type_code)
          const customViolation = !isKnownViolation(r.violation_code)
          return (
            <div key={`${r.rule_id ?? 'new'}-${i}`} className="fine-rate">
              <div className="fine-rate-row">
                <Field label="Session">
                  <select
                    value={customSession ? '__custom' : r.session_type_code}
                    onChange={(e) =>
                      setRule(i, { session_type_code: e.target.value === '__custom' ? '' : e.target.value })
                    }
                  >
                    {SESSION_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {sessionLabel(s)}
                      </option>
                    ))}
                    <option value="__custom">Custom…</option>
                  </select>
                </Field>
                <Field label="Violation">
                  <select
                    value={customViolation ? '__custom' : r.violation_code}
                    onChange={(e) =>
                      setRule(i, { violation_code: e.target.value === '__custom' ? '' : e.target.value })
                    }
                  >
                    {VIOLATIONS.map((v) => (
                      <option key={v} value={v}>
                        {violationLabel(v)}
                      </option>
                    ))}
                    <option value="__custom">Custom…</option>
                  </select>
                </Field>
                <div className="row grid-end">
                  <div className="fine-amount">
                    <Field label="Amount (₱)">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={Number.isFinite(r.fine_amount) ? r.fine_amount : 0}
                        onChange={(e) => setRule(i, { fine_amount: Number(e.target.value) })}
                        required
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    title={rules.length === 1 ? 'Keep at least one rate' : 'Remove rate'}
                    aria-label={rules.length === 1 ? 'Keep at least one rate' : `Remove rate ${i + 1}`}
                    disabled={rules.length === 1 || busy}
                    onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {customSession || customViolation ? (
                <div className="grid-2">
                  {customSession ? (
                    <Field label="Custom session">
                      <input
                        value={r.session_type_code}
                        onChange={(e) => setRule(i, { session_type_code: e.target.value.toUpperCase() })}
                        placeholder="e.g. NIGHT"
                      />
                    </Field>
                  ) : (
                    <div />
                  )}
                  {customViolation ? (
                    <Field label="Custom violation">
                      <input
                        value={r.violation_code}
                        onChange={(e) => setRule(i, { violation_code: e.target.value.toUpperCase() })}
                        placeholder="e.g. EARLY_LEAVE"
                      />
                    </Field>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
        <FormActions
          onCancel={onClose}
          submitLabel={isEdit ? (publish ? `Publish v${nextVersion}` : 'Save draft') : 'Create'}
          busy={busy}
        />
      </form>
    </Modal>
  )
}
