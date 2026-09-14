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
  const [breakdown, setBreakdown] = useState<SectionBreakdown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [studentQuery, setStudentQuery] = useState('')

  useEffect(() => {
    let active = true
    async function fetchBreakdown() {
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
    }
    void fetchBreakdown()
    return () => {
      active = false
    }
  }, [sectionId])

  const filteredStudents = (breakdown?.students ?? []).filter((s) => {
    if (!studentQuery.trim()) return true
    const q = studentQuery.toLowerCase()
    const name = `${s.first_name} ${s.middle_name ?? ''} ${s.last_name} ${s.suffix ?? ''}`.toLowerCase()
    return s.student_number.toLowerCase().includes(q) || name.includes(q)
  })

  return (
    <Modal
      wide
      title={breakdown ? `Section ${breakdown.section_code} Roster` : 'Section Roster'}
      onClose={onClose}
    >
      {loading ? (
        <TableSkeleton columns={rosterSkeletonColumns} rows={5} />
      ) : error ? (
        <EmptyState title="Error Loading Roster" subtitle={error} />
      ) : breakdown ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
              padding: '0.85rem',
              background: 'var(--color-neutral-50, #f8fafc)',
              borderRadius: '8px',
              border: '1px solid var(--color-neutral-200, #e2e8f0)',
            }}
          >
            <div>
              <small style={{ color: '#64748b', display: 'block' }}>Program</small>
              <strong>{breakdown.program_code}</strong> - {breakdown.program_name}
            </div>
            <div>
              <small style={{ color: '#64748b', display: 'block' }}>Year Level</small>
              <strong>{fmtYearLevel(breakdown.year_level)}</strong>
            </div>
            <div>
              <small style={{ color: '#64748b', display: 'block' }}>Academic Year & Term</small>
              <strong>{breakdown.year_code ?? breakdown.term_code}</strong> ({breakdown.term_name})
            </div>
            <div>
              <small style={{ color: '#64748b', display: 'block' }}>Total Enrolled</small>
              <strong style={{ color: '#2563eb' }}>{breakdown.enrolled_student_count} Students</strong>
            </div>
          </div>

          <div className="search" style={{ marginBottom: 0 }}>
            <Search size={16} />
            <input
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Search student by number or name..."
            />
            {studentQuery ? (
              <button className="icon-btn" onClick={() => setStudentQuery('')} title="Clear">
                <X size={16} />
              </button>
            ) : null}
          </div>

          {filteredStudents.length === 0 ? (
            <EmptyState
              title="No students found"
              subtitle={
                studentQuery
                  ? 'No enrolled students match your search query.'
                  : 'There are currently no active student enrollments for this section.'
              }
            />
          ) : (
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Student ID</th>
                    <th>Full Name</th>
                    <th>Status</th>
                    <th>Enrollment Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s, idx) => (
                    <tr key={s.student_enrollment_id}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong style={{ fontFamily: 'monospace' }}>{s.student_number}</strong>
                      </td>
                      <td>
                        {s.last_name}, {s.first_name} {s.middle_name ? `${s.middle_name} ` : ''}
                        {s.suffix ?? ''}
                      </td>
                      <td>
                        <span className={`badge badge-${s.enrollment_status_code === 'ENROLLED' ? 'success' : 'neutral'}`}>
                          {s.enrollment_status_code}
                        </span>
                      </td>
                      <td>{s.effective_from_utc ? fmtDate(s.effective_from_utc) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
  
  // Tree selection state
  const [activePath, setActivePath] = useState<{
    yearId?: number
    termId?: number
    programId?: number
  } | null>(null)
  
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const debounced = useDebounced(query, 350)

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
        <div className="toolbar" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => setCreateModal('program')}>
            <Plus size={16} /> New Program
          </Button>
          <Button variant="secondary" onClick={() => setCreateModal('term')}>
            <Plus size={16} /> New Term
          </Button>
          <Button onClick={() => setCreateModal('year')}>
            <Plus size={16} /> New Academic Year
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
        
        {/* Left Sidebar: Academic Tree */}
        <div style={{
          flex: '0 0 280px',
          background: 'var(--color-neutral-50, #f8fafc)',
          borderRadius: '10px',
          border: '1px solid var(--color-neutral-200, #e2e8f0)',
          padding: '1rem',
          position: 'sticky',
          top: '1rem'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} /> Hierarchy
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button
              onClick={() => setActivePath(null)}
              style={{
                textAlign: 'left',
                background: !activePath ? '#e0e7ff' : 'transparent',
                color: !activePath ? '#4338ca' : '#475569',
                border: 'none',
                padding: '0.4rem 0.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: !activePath ? 600 : 400,
                fontSize: '0.9rem'
              }}
            >
              All Academic Years
            </button>
            
            {hierarchy?.map(year => (
              <div key={year.academic_year_id}>
                <button
                  onClick={() => setActivePath({ yearId: year.academic_year_id })}
                  style={{
                    textAlign: 'left',
                    background: activePath?.yearId === year.academic_year_id && !activePath.termId ? '#e0e7ff' : 'transparent',
                    color: activePath?.yearId === year.academic_year_id && !activePath.termId ? '#4338ca' : '#0f172a',
                    border: 'none',
                    padding: '0.4rem 0.5rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <Calendar size={14} /> AY {year.year_code}
                </button>
                
                {year.terms.map(term => (
                  <div key={term.academic_term_id} style={{ paddingLeft: '1rem', marginTop: '0.25rem' }}>
                    <button
                      onClick={() => setActivePath({ yearId: year.academic_year_id, termId: term.academic_term_id })}
                      style={{
                        textAlign: 'left',
                        background: activePath?.termId === term.academic_term_id && !activePath.programId ? '#e0e7ff' : 'transparent',
                        color: activePath?.termId === term.academic_term_id && !activePath.programId ? '#4338ca' : '#334155',
                        border: 'none',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        width: '100%'
                      }}
                    >
                      {term.term_name}
                    </button>
                    
                    {(activePath?.termId === term.academic_term_id || activePath?.yearId === year.academic_year_id) && 
                      term.programs.map(prog => (
                        <div key={prog.academic_program_id} style={{ paddingLeft: '1rem', marginTop: '0.15rem' }}>
                          <button
                            onClick={() => setActivePath({ 
                              yearId: year.academic_year_id, 
                              termId: term.academic_term_id, 
                              programId: prog.academic_program_id 
                            })}
                            style={{
                              textAlign: 'left',
                              background: activePath?.programId === prog.academic_program_id && activePath?.termId === term.academic_term_id ? '#e0e7ff' : 'transparent',
                              color: activePath?.programId === prog.academic_program_id && activePath?.termId === term.academic_term_id ? '#4338ca' : '#64748b',
                              border: 'none',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem'
                            }}
                          >
                            <GraduationCap size={12} /> {prog.program_code}
                          </button>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Sections */}
        <div style={{ flex: '1', minWidth: 0 }}>
          <div className="search" style={{ marginBottom: '1.5rem' }}>
            <Search size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by section code, section name, or program..."
            />
            {query ? (
              <button className="icon-btn" onClick={() => setQuery('')} title="Clear">
                <X size={16} />
              </button>
            ) : null}
          </div>

          {error ? (
            <EmptyState title="Error Loading Sections" subtitle={error} />
          ) : sections === null ? (
            <TableSkeleton columns={sectionSkeletonColumns} rows={6} />
          ) : filteredSections.length === 0 ? (
            <EmptyState
              title="No sections found"
              subtitle={
                activePath || query
                  ? 'No sections match your selected path or search.'
                  : 'No academic sections available.'
              }
              action={
                (activePath || query) ? (
                  <Button variant="secondary" onClick={() => { setActivePath(null); setQuery(''); }}>
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {Array.from(groupedSections.entries()).map(([progCode, { programName, list }]) => (
                <div key={progCode}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      paddingBottom: '0.6rem',
                      marginBottom: '1rem',
                      borderBottom: '2px solid var(--color-neutral-200, #e2e8f0)',
                    }}
                  >
                    <div
                      style={{
                        background: '#2563eb',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '6px',
                      }}
                    >
                      {progCode}
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>
                      {programName}
                    </h3>
                    <span style={{ fontSize: '0.825rem', color: '#64748b', marginLeft: 'auto' }}>
                      {list.length} {list.length === 1 ? 'Section' : 'Sections'}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '1.25rem',
                    }}
                  >
                    {list.map((sec) => (
                      <div
                        key={sec.section_id}
                        className="card"
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          padding: '1.25rem',
                          borderRadius: '10px',
                          border: '1px solid var(--color-neutral-200, #e2e8f0)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '0.5rem',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                background: 'rgba(37, 99, 235, 0.1)',
                                color: '#2563eb',
                              }}
                            >
                              {sec.program_code}
                            </span>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                background: 'rgba(100, 116, 139, 0.1)',
                                color: '#475569',
                              }}
                            >
                              {fmtYearLevel(sec.year_level)}
                            </span>
                          </div>

                          <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0.25rem 0', color: '#0f172a' }}>
                            {sec.section_code}
                          </h3>
                          {sec.section_name ? (
                            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>
                              {sec.section_name}
                            </p>
                          ) : null}

                          <div
                            style={{
                              fontSize: '0.825rem',
                              color: '#475569',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.35rem',
                              marginTop: '0.75rem',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <GraduationCap size={14} style={{ color: '#2563eb' }} />
                              <span>AY {sec.year_code ?? '2026-2027'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <BookOpen size={14} style={{ color: '#94a3b8' }} />
                              <span>{sec.program_name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Layers size={14} style={{ color: '#94a3b8' }} />
                              <span>Term: {sec.term_code}</span>
                            </div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                marginTop: '0.25rem',
                                color: '#0f172a',
                                fontWeight: 600,
                              }}
                            >
                              <Users size={14} style={{ color: '#2563eb' }} />
                              <span>{sec.enrolled_student_count} Enrolled</span>
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: '1.25rem' }}>
                          <Button
                            variant="secondary"
                            style={{ width: '100%', justifyContent: 'center' }}
                            onClick={() => setSelectedSectionId(sec.section_id)}
                          >
                            View Roster
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
