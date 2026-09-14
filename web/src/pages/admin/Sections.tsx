import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Calendar, GraduationCap, Layers, Plus, Search, Users, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Button, EmptyState, Field, Modal, TableSkeleton } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDate, fmtYearLevel } from '../../lib/format'
import { useToast } from '../../lib/toast'
import type { AcademicYear, Section, SectionBreakdown } from '../../lib/types'

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function titleCaseStatus(code: string | null | undefined): string {
  if (!code) return '—'
  return `${code.charAt(0)}${code.slice(1).toLowerCase()}`
}

function studentDisplayName(s: {
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
}): string {
  const mid = s.middle_name ? ` ${s.middle_name}` : ''
  const suffix = s.suffix ? ` ${s.suffix}` : ''
  return `${s.last_name}, ${s.first_name}${mid}${suffix}`.replace(/\s+/g, ' ').trim()
}

function pathLabel(
  hierarchy: AcademicYear[] | null,
  path: { yearId?: number; termId?: number; programId?: number } | null,
): string | null {
  if (!path || !hierarchy) return null
  const year = hierarchy.find((y) => y.academic_year_id === path.yearId)
  if (!year) return null
  const term = year.terms.find((t) => t.academic_term_id === path.termId)
  const program = term?.programs.find((p) => p.academic_program_id === path.programId)
  return ['AY ' + year.year_code, term?.term_name, program?.program_code].filter(Boolean).join(' · ')
}

function CreateYearModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast()
  const [yearCode, setYearCode] = useState('')
  const [yearName, setYearName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/admin/academic-years', {
        year_code: yearCode.trim(),
        year_name: yearName.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
      })
      toast('Academic year created')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create academic year')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New Academic Year" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="callout callout-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <Field label="Year Code (e.g. 2026-2027)">
          <input required value={yearCode} onChange={e => setYearCode(e.target.value)} placeholder="2026-2027" />
        </Field>
        <Field label="Year Name">
          <input required value={yearName} onChange={e => setYearName(e.target.value)} placeholder="Academic Year 2026–2027" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Starts On">
            <input required type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Ends On">
            <input required type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Year'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function CreateTermModal({
  years,
  defaultYearId,
  onClose,
  onCreated,
}: {
  years: AcademicYear[]
  defaultYearId?: number
  onClose: () => void
  onCreated: () => void
}) {
  const { toast } = useToast()
  const [yearId, setYearId] = useState<number>(defaultYearId ?? (years[0]?.academic_year_id || 0))
  const [termCode, setTermCode] = useState('')
  const [termName, setTermName] = useState('')
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!yearId) {
      setError('Please select an Academic Year')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/admin/academic-terms', {
        academic_year_id: yearId,
        term_code: termCode.trim(),
        term_name: termName.trim(),
        starts_on: startsOn,
        ends_on: endsOn,
      })
      toast('Academic term created')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create academic term')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New Academic Term" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="callout callout-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <Field label="Academic Year">
          <select value={yearId} onChange={e => setYearId(Number(e.target.value))} required>
            <option value="" disabled>Select Academic Year</option>
            {years.map(y => (
              <option key={y.academic_year_id} value={y.academic_year_id}>
                {y.year_code}{y.year_name ? ` (${y.year_name})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Term Code (e.g. 1S, 2S, SUMMER)">
          <input required value={termCode} onChange={e => setTermCode(e.target.value)} placeholder="1S" />
        </Field>
        <Field label="Term Name">
          <input required value={termName} onChange={e => setTermName(e.target.value)} placeholder="First Semester" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Starts On">
            <input required type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} />
          </Field>
          <Field label="Ends On">
            <input required type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} />
          </Field>
        </div>
        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Term'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function CreateProgramModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast()
  const [programCode, setProgramCode] = useState('')
  const [programName, setProgramName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/admin/academic-programs', {
        program_code: programCode.trim().toUpperCase(),
        program_name: programName.trim(),
      })
      toast('Academic program created')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create academic program')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal title="New Academic Program" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="callout callout-error" style={{ marginBottom: '1rem' }}>{error}</div>}
        <Field label="Program Code (e.g. BSIT, BSCS, BSBA)">
          <input required value={programCode} onChange={e => setProgramCode(e.target.value)} placeholder="BSIT" />
        </Field>
        <Field label="Program Name">
          <input required value={programName} onChange={e => setProgramName(e.target.value)} placeholder="Bachelor of Science in Information Technology" />
        </Field>
        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Program'}</Button>
        </div>
      </form>
    </Modal>
  )
}

const rosterSkeletonColumns = [
  { label: '#' },
  { label: 'Student ID' },
  { label: 'Full Name' },
  { label: 'Status' },
  { label: 'Enrollment Date' },
]

const sectionSkeletonColumns = [
  { label: 'Code' },
  { label: 'Program' },
  { label: 'Year' },
  { label: 'Term' },
  { label: 'Enrolled' },
]

function SectionRosterModal({
  sectionId,
  onClose,
}: {
  sectionId: number
  onClose: () => void
}) {
  const searchId = useId()
  const [breakdown, setBreakdown] = useState<SectionBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [studentQuery, setStudentQuery] = useState('')

  async function fetchBreakdown() {
    try {
      setLoading(true)
      const data = await api.get<SectionBreakdown>(`/admin/sections/${sectionId}`)
      setBreakdown(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load section roster')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        setLoading(true)
        const data = await api.get<SectionBreakdown>(`/admin/sections/${sectionId}`)
        if (active) {
          setBreakdown(data)
          setError(null)
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Failed to load section roster')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [sectionId])

  const filteredStudents = (breakdown?.students ?? []).filter((s) => {
    if (!studentQuery.trim()) return true
    const q = studentQuery.toLowerCase()
    return s.student_number.toLowerCase().includes(q) || studentDisplayName(s).toLowerCase().includes(q)
  })

  const title = breakdown
    ? `${breakdown.section_name || breakdown.section_code} roster`
    : 'Section roster'

  return (
    <Modal wide title={title} onClose={onClose}>
      {loading ? (
        <TableSkeleton label="Loading roster" columns={rosterSkeletonColumns} rows={5} />
      ) : error ? (
        <EmptyState
          title="Could not load roster"
          subtitle={error}
          action={<Button variant="secondary" onClick={() => void fetchBreakdown()}>Try again</Button>}
        />
      ) : breakdown ? (
        <>
          <div className="roster-meta">
            <div>
              <small>Program</small>
              <strong>
                {breakdown.program_code}
                {breakdown.program_name ? ` · ${breakdown.program_name}` : ''}
              </strong>
            </div>
            <div>
              <small>Year level</small>
              <strong>{fmtYearLevel(breakdown.year_level)}</strong>
            </div>
            <div>
              <small>Term</small>
              <strong>
                {breakdown.year_code ? `AY ${breakdown.year_code} · ` : ''}
                {breakdown.term_name || breakdown.term_code}
              </strong>
            </div>
            <div>
              <small>Enrolled</small>
              <strong>
                {breakdown.enrolled_student_count}{' '}
                {breakdown.enrolled_student_count === 1 ? 'student' : 'students'}
              </strong>
            </div>
          </div>

          <div className="search" style={{ marginBottom: 16 }}>
            <label className="visually-hidden" htmlFor={searchId}>
              Search students in this section
            </label>
            <Search size={16} aria-hidden />
            <input
              id={searchId}
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Search student ID or name"
            />
            {studentQuery ? (
              <button type="button" className="icon-btn" onClick={() => setStudentQuery('')} title="Clear search">
                <X size={16} />
              </button>
            ) : null}
          </div>

          {filteredStudents.length === 0 ? (
            <EmptyState
              title={studentQuery ? 'No matching students' : 'No students enrolled'}
              subtitle={
                studentQuery
                  ? 'Try a different name or student ID.'
                  : 'This section has no active enrollments right now.'
              }
              action={
                studentQuery ? (
                  <Button variant="secondary" onClick={() => setStudentQuery('')}>
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="card table-card roster-table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s, idx) => (
                    <tr key={s.student_enrollment_id}>
                      <td>{idx + 1}</td>
                      <td className="cell-id">{s.student_number}</td>
                      <td>{studentDisplayName(s)}</td>
                      <td>
                        <span
                          className={`chip ${s.enrollment_status_code === 'ENROLLED' ? 'chip-active' : 'chip-inactive'}`}
                        >
                          {titleCaseStatus(s.enrollment_status_code)}
                        </span>
                      </td>
                      <td>{s.effective_from_utc ? fmtDate(s.effective_from_utc) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </Modal>
  )
}

export function AdminSections() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [hierarchy, setHierarchy] = useState<AcademicYear[] | null>(null)
  const [sections, setSections] = useState<Section[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createModal, setCreateModal] = useState<'year' | 'term' | 'program' | null>(null)
  const [activePath, setActivePath] = useState<{
    yearId?: number
    termId?: number
    programId?: number
  } | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const debounced = useDebounced(query, 350)
  const filterText = pathLabel(hierarchy, activePath)

  async function loadData() {
    try {
      const [hData, sData] = await Promise.all([
        api.get<AcademicYear[]>('/admin/academics/hierarchy'),
        api.get<Section[]>('/admin/sections', { q: debounced.trim() || undefined })
      ])
      setHierarchy(hData)
      setSections(sData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sections')
    }
  }

  useEffect(() => {
    void loadData()
  }, [debounced])

  useEffect(() => {
    const next = searchParams.get('new')
    if (next === 'program' || next === 'term' || next === 'year') {
      setCreateModal(next)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Filter sections by active tree selection
  const filteredSections = useMemo(() => {
    if (!sections) return []
    return sections.filter((s) => {
      if (!activePath) return true
      if (activePath.yearId && s.academic_year_id !== activePath.yearId) return false
      if (activePath.termId && s.academic_term_id !== activePath.termId) return false
      if (activePath.programId && s.academic_program_id !== activePath.programId) return false
      return true
    })
  }, [sections, activePath])

  // Group sections by Program Code for the right panel
  const groupedSections = useMemo(() => {
    const map = new Map<string, { programName: string; list: Section[] }>()
    for (const sec of filteredSections) {
      if (!map.has(sec.program_code)) {
        map.set(sec.program_code, { programName: sec.program_name, list: [] })
      }
      map.get(sec.program_code)!.list.push(sec)
    }
    for (const entry of map.values()) {
      entry.list.sort((a, b) => a.year_level - b.year_level || a.section_code.localeCompare(b.section_code))
    }
    return map
  }, [filteredSections])

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Academics</h2>
          <p>Manage academic years, terms, programs, sections, and class rosters.</p>
        </div>
        <div className="toolbar">
          <Button variant="secondary" onClick={() => setCreateModal('program')}>
            <Plus size={16} /> New program
          </Button>
          <Button variant="secondary" onClick={() => setCreateModal('term')}>
            <Plus size={16} /> New term
          </Button>
          <Button onClick={() => setCreateModal('year')}>
            <Plus size={16} /> New academic year
          </Button>
        </div>
      </div>

      <div className="sections-layout">
        <nav className="sections-tree" aria-label="Academic hierarchy">
          <h3>
            <Layers size={18} aria-hidden /> Academic years
          </h3>
          <div className="sections-tree-list">
            <button
              type="button"
              className={`tree-item${!activePath ? ' is-current' : ''}`}
              aria-current={!activePath ? 'true' : undefined}
              onClick={() => setActivePath(null)}
            >
              All years
            </button>
            {hierarchy === null && !error ? (
              <p className="tree-muted">Loading years…</p>
            ) : hierarchy && hierarchy.length === 0 ? (
              <p className="tree-muted">Create an academic year to organize sections.</p>
            ) : (
              hierarchy?.map((year) => {
                const yearCurrent = activePath?.yearId === year.academic_year_id && !activePath.termId
                return (
                  <div key={year.academic_year_id}>
                    <button
                      type="button"
                      className={`tree-item is-year${yearCurrent ? ' is-current' : ''}`}
                      aria-current={yearCurrent ? 'true' : undefined}
                      onClick={() => setActivePath({ yearId: year.academic_year_id })}
                    >
                      <Calendar size={14} aria-hidden /> AY {year.year_code}
                    </button>
                    <div className="tree-nest">
                      {year.terms.map((term) => {
                        const termCurrent =
                          activePath?.termId === term.academic_term_id && !activePath.programId
                        const showPrograms =
                          activePath?.termId === term.academic_term_id ||
                          activePath?.yearId === year.academic_year_id
                        return (
                          <div key={term.academic_term_id}>
                            <button
                              type="button"
                              className={`tree-item${termCurrent ? ' is-current' : ''}`}
                              aria-current={termCurrent ? 'true' : undefined}
                              onClick={() =>
                                setActivePath({
                                  yearId: year.academic_year_id,
                                  termId: term.academic_term_id,
                                })
                              }
                            >
                              {term.term_name}
                            </button>
                            {showPrograms ? (
                              <div className="tree-nest">
                                {term.programs.map((prog) => {
                                  const programCurrent =
                                    activePath?.programId === prog.academic_program_id &&
                                    activePath?.termId === term.academic_term_id
                                  return (
                                    <button
                                      key={prog.academic_program_id}
                                      type="button"
                                      className={`tree-item${programCurrent ? ' is-current' : ''}`}
                                      aria-current={programCurrent ? 'true' : undefined}
                                      onClick={() =>
                                        setActivePath({
                                          yearId: year.academic_year_id,
                                          termId: term.academic_term_id,
                                          programId: prog.academic_program_id,
                                        })
                                      }
                                    >
                                      <GraduationCap size={14} aria-hidden /> {prog.program_code}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </nav>

        <div>
          <div className="filter-bar">
            <div className="search">
              <label className="visually-hidden" htmlFor={searchId}>
                Search sections
              </label>
              <Search size={16} aria-hidden />
              <input
                id={searchId}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search section, code, or program"
              />
              {query ? (
                <button type="button" className="icon-btn" onClick={() => setQuery('')} title="Clear search">
                  <X size={16} />
                </button>
              ) : null}
            </div>
          </div>

          {filterText ? (
            <div className="sections-filter-note">
              Showing {filterText}
              <Button variant="ghost" onClick={() => setActivePath(null)}>
                Clear filter
              </Button>
            </div>
          ) : null}

          {error ? (
            <EmptyState
              title="Could not load sections"
              subtitle={error}
              action={
                <Button variant="secondary" onClick={() => void loadData()}>
                  Try again
                </Button>
              }
            />
          ) : sections === null ? (
            <TableSkeleton label="Loading sections" columns={sectionSkeletonColumns} rows={6} />
          ) : filteredSections.length === 0 ? (
            <EmptyState
              title={activePath || query ? 'No matching sections' : 'No sections yet'}
              subtitle={
                activePath || query
                  ? 'Try a different year, term, program, or search.'
                  : 'Sections appear here after the school roster is imported.'
              }
              action={
                activePath || query ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActivePath(null)
                      setQuery('')
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <p className="muted" style={{ marginBottom: 16 }}>
                {filteredSections.length} section{filteredSections.length === 1 ? '' : 's'}
              </p>
              {Array.from(groupedSections.entries()).map(([progCode, { programName, list }]) => (
                <section key={progCode} className="sections-group">
                  <div className="sections-group-head">
                    <span className="chip chip-window current">{progCode}</span>
                    <h3>{programName}</h3>
                    <span className="count">
                      {list.length} {list.length === 1 ? 'section' : 'sections'}
                    </span>
                  </div>
                  <div className="sections-grid">
                    {list.map((sec) => {
                      const title = sec.section_name || sec.section_code
                      const code =
                        sec.section_name && sec.section_name !== sec.section_code
                          ? sec.section_code
                          : null
                      return (
                        <button
                          key={sec.section_id}
                          type="button"
                          className="card card-click section-card"
                          onClick={() => setSelectedSectionId(sec.section_id)}
                        >
                          <div className="section-card-top">
                            <span className="chip chip-window current">{fmtYearLevel(sec.year_level)}</span>
                            {sec.term_name ? <span className="chip chip-window">{sec.term_name}</span> : null}
                          </div>
                          <h3>{title}</h3>
                          {code ? <p className="meta cell-id">{code}</p> : null}
                          {sec.year_code ? <p className="meta">AY {sec.year_code}</p> : null}
                          <p className="section-card-enrolled">
                            {sec.enrolled_student_count}{' '}
                            {sec.enrolled_student_count === 1 ? 'student' : 'students'}
                          </p>
                          <span className="section-card-action">View roster</span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>

      {selectedSectionId !== null ? (
        <SectionRosterModal
          sectionId={selectedSectionId}
          onClose={() => setSelectedSectionId(null)}
        />
      ) : null}

      {createModal === 'year' ? (
        <CreateYearModal
          onClose={() => setCreateModal(null)}
          onCreated={() => void loadData()}
        />
      ) : null}

      {createModal === 'term' ? (
        <CreateTermModal
          years={hierarchy ?? []}
          defaultYearId={activePath?.yearId}
          onClose={() => setCreateModal(null)}
          onCreated={() => void loadData()}
        />
      ) : null}

      {createModal === 'program' ? (
        <CreateProgramModal
          onClose={() => setCreateModal(null)}
          onCreated={() => void loadData()}
        />
      ) : null}
    </>
  )
}
