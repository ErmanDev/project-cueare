import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Calendar, Filter, GraduationCap, Layers, Search, Users, X } from 'lucide-react'

import { Button, EmptyState, Modal, TableSkeleton } from '../../components/ui'
import { api } from '../../lib/api'
import { fmtDate, fmtYearLevel } from '../../lib/format'
import type { Section, SectionBreakdown } from '../../lib/types'

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
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
  const [query, setQuery] = useState('')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('ALL')
  const [selectedProgram, setSelectedProgram] = useState<string>('ALL')
  const [selectedYearLevel, setSelectedYearLevel] = useState<string>('ALL')
  const [selectedTerm, setSelectedTerm] = useState<string>('ALL')
  const [sections, setSections] = useState<Section[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)

  const debounced = useDebounced(query, 350)

  async function load(q = debounced) {
    try {
      const data = await api.get<Section[]>('/admin/sections', {
        q: q.trim() || undefined,
      })
      setSections(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sections')
    }
  }

  useEffect(() => {
    void load(debounced)
  }, [debounced])

  // Unique Academic Years present
  const academicYears = useMemo(() => {
    if (!sections) return []
    const map = new Map<string, string>()
    for (const s of sections) {
      const code = s.year_code ?? '2026-2027'
      const name = s.year_name ?? `Academic Year ${code}`
      map.set(code, name)
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }))
  }, [sections])

  // Unique program codes
  const programCodes = useMemo(() => {
    if (!sections) return []
    return Array.from(new Set(sections.map((s) => s.program_code))).sort()
  }, [sections])

  // Unique year levels present
  const yearLevels = useMemo(() => {
    if (!sections) return []
    return Array.from(new Set(sections.map((s) => s.year_level))).sort((a, b) => a - b)
  }, [sections])

  // Unique terms present
  const terms = useMemo(() => {
    if (!sections) return []
    const map = new Map<string, string>()
    for (const s of sections) {
      map.set(s.term_code, s.term_name)
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }))
  }, [sections])

  // Multi-dimensional filtering
  const filteredSections = useMemo(() => {
    if (!sections) return []
    return sections.filter((s) => {
      const ayCode = s.year_code ?? '2026-2027'
      if (selectedAcademicYear !== 'ALL' && ayCode !== selectedAcademicYear) return false
      if (selectedProgram !== 'ALL' && s.program_code !== selectedProgram) return false
      if (selectedYearLevel !== 'ALL' && String(s.year_level) !== selectedYearLevel) return false
      if (selectedTerm !== 'ALL' && s.term_code !== selectedTerm) return false
      return true
    })
  }, [sections, selectedAcademicYear, selectedProgram, selectedYearLevel, selectedTerm])

  // Group sections by Program Code
  const groupedSections = useMemo(() => {
    const map = new Map<string, { programName: string; list: Section[] }>()
    for (const sec of filteredSections) {
      if (!map.has(sec.program_code)) {
        map.set(sec.program_code, { programName: sec.program_name, list: [] })
      }
      map.get(sec.program_code)!.list.push(sec)
    }
    // Sort sections within each program by year_level ascending
    for (const entry of map.values()) {
      entry.list.sort((a, b) => a.year_level - b.year_level || a.section_code.localeCompare(b.section_code))
    }
    return map
  }, [filteredSections])

  const hasActiveFilters =
    selectedAcademicYear !== 'ALL' ||
    selectedProgram !== 'ALL' ||
    selectedYearLevel !== 'ALL' ||
    selectedTerm !== 'ALL' ||
    query !== ''

  function resetFilters() {
    setSelectedAcademicYear('ALL')
    setSelectedProgram('ALL')
    setSelectedYearLevel('ALL')
    setSelectedTerm('ALL')
    setQuery('')
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Sections & Roster</h2>
          <p>Filter by Academic Year, Program, Year Level, and Semester</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.5rem' }}>
        <div className="search" style={{ marginBottom: 0 }}>
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

        {/* Filter Controls Bar */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '1rem',
            background: 'var(--color-neutral-50, #f8fafc)',
            borderRadius: '10px',
            border: '1px solid var(--color-neutral-200, #e2e8f0)',
          }}
        >
          {/* Academic Year Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: '125px' }}>
              <GraduationCap size={14} /> Academic Year:
            </span>
            <button
              className={`btn ${selectedAcademicYear === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
              onClick={() => setSelectedAcademicYear('ALL')}
            >
              All Academic Years
            </button>
            {academicYears.map(({ code }) => {
              const count = sections?.filter((s) => (s.year_code ?? '2026-2027') === code).length ?? 0
              const active = selectedAcademicYear === code
              return (
                <button
                  key={code}
                  className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
                  onClick={() => setSelectedAcademicYear(code)}
                >
                  AY {code} ({count})
                </button>
              )
            })}
          </div>

          {/* Program Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: '125px' }}>
              <Filter size={14} /> Program:
            </span>
            <button
              className={`btn ${selectedProgram === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
              onClick={() => setSelectedProgram('ALL')}
            >
              All Programs ({sections?.length ?? 0})
            </button>
            {programCodes.map((code) => {
              const count = sections?.filter((s) => s.program_code === code).length ?? 0
              const active = selectedProgram === code
              return (
                <button
                  key={code}
                  className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
                  onClick={() => setSelectedProgram(code)}
                >
                  {code} ({count})
                </button>
              )
            })}
          </div>

          {/* Year Level Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: '125px' }}>
              <Calendar size={14} /> Year Level:
            </span>
            <button
              className={`btn ${selectedYearLevel === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
              onClick={() => setSelectedYearLevel('ALL')}
            >
              All Years
            </button>
            {yearLevels.map((lvl) => {
              const count = sections?.filter((s) => s.year_level === lvl).length ?? 0
              const active = selectedYearLevel === String(lvl)
              return (
                <button
                  key={lvl}
                  className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px' }}
                  onClick={() => setSelectedYearLevel(String(lvl))}
                >
                  {fmtYearLevel(lvl)} ({count})
                </button>
              )
            })}
          </div>

          {/* Term Filter Dropdown (if multiple terms) */}
          {terms.length > 1 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', minWidth: '125px' }}>
                <Layers size={14} /> Semester:
              </span>
              <select
                className="input"
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
                style={{ maxWidth: '240px', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
              >
                <option value="ALL">All Semesters</option>
                {terms.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Reset Filters button */}
          {hasActiveFilters ? (
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
              <button
                className="icon-btn"
                style={{ fontSize: '0.8rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.25rem', border: 'none', background: 'transparent', cursor: 'pointer' }}
                onClick={resetFilters}
              >
                <X size={14} /> Reset all filters
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <EmptyState title="Error Loading Sections" subtitle={error} />
      ) : sections === null ? (
        <TableSkeleton columns={sectionSkeletonColumns} rows={6} />
      ) : filteredSections.length === 0 ? (
        <EmptyState
          title="No sections found"
          subtitle={
            hasActiveFilters
              ? 'No sections match your selected filters. Try clearing or adjusting them.'
              : 'No academic sections available.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
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
                            fontWeight: 600,
                            color: '#1e293b',
                          }}
                        >
                          <Users size={14} style={{ color: '#2563eb' }} />
                          <span>{sec.enrolled_student_count} Enrolled Students</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={() => setSelectedSectionId(sec.section_id)}
                      >
                        <Users size={16} /> View Roster Breakdown
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSectionId !== null ? (
        <SectionRosterModal
          sectionId={selectedSectionId}
          onClose={() => setSelectedSectionId(null)}
        />
      ) : null}
    </>
  )
}
