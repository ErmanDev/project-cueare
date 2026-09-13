import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Plus, Printer, QrCode, Search, Square, Trash2, UserPlus, Users, X } from 'lucide-react'

import { ParticipantQrModal } from './ParticipantQrModal'
import { Button, EmptyState, Modal, TableSkeleton } from './ui'
import { api } from '../lib/api'
import { fmtYearLevel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { Event, EventParticipant, Student, StudentPage } from '../lib/types'

type SectionOption = {
  section_id: number
  section_name: string
  student_count: number
}

export function EventRosterModal({
  event,
  onClose,
  onUpdated,
}: {
  event: Event
  onClose: () => void
  onUpdated: () => void
}) {
  const { toast } = useToast()
  const [tab, setTab] = useState<'roster' | 'add'>('roster')

  // Roster state
  const [participants, setParticipants] = useState<EventParticipant[] | null>(null)
  const [totalParticipants, setTotalParticipants] = useState<number>(0)
  const [rosterSearch, setRosterSearch] = useState('')
  const [rosterLoading, setRosterLoading] = useState(false)
  const [qrTarget, setQrTarget] = useState<{ studentId: number | null } | null>(null)

  // Add state
  const [sections, setSections] = useState<SectionOption[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string>('')
  const [studentSearch, setStudentSearch] = useState('')
  const [availableStudents, setAvailableStudents] = useState<Student[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set())
  const [searchLoading, setSearchLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(false)

  const enrolledStudentIds = useMemo(() => {
    return new Set((participants ?? []).map((p) => p.student_id))
  }, [participants])

  async function loadRoster() {
    setRosterLoading(true)
    try {
      const res = await api.get<{ rows: EventParticipant[]; total: number }>(
        `/admin/events/${event.id}/participants`,
        { q: rosterSearch.trim() || undefined, limit: 200 },
      )
      setParticipants(res.rows)
      setTotalParticipants(res.total)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load roster', 'error')
    } finally {
      setRosterLoading(false)
    }
  }

  async function loadSections() {
    try {
      const list = await api.get<SectionOption[]>('/admin/sections')
      setSections(list)
    } catch {
      setSections([])
    }
  }

  async function searchStudents() {
    setSearchLoading(true)
    try {
      const res = await api.get<StudentPage>('/admin/students', {
        q: studentSearch.trim() || undefined,
        per_page: 50,
      })
      setAvailableStudents(res.students)
    } catch {
      setAvailableStudents([])
    } finally {
      setSearchLoading(false)
    }
  }

  useEffect(() => {
    void loadRoster()
    void loadSections()
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadRoster()
    }, 350)
    return () => window.clearTimeout(t)
  }, [rosterSearch])

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (tab === 'add') {
        void searchStudents()
      }
    }, 350)
    return () => window.clearTimeout(t)
  }, [studentSearch, tab])

  async function handleRemoveParticipant(studentId: number, studentName: string) {
    if (!window.confirm(`Remove ${studentName} from "${event.name}" roster?`)) return
    try {
      await api.delete(`/admin/events/${event.id}/participants/${studentId}`)
      toast(`Removed ${studentName}`)
      void loadRoster()
      onUpdated()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove student', 'error')
    }
  }

  async function handleEnrollSection() {
    if (!selectedSectionId) {
      toast('Please select a section', 'error')
      return
    }
    const sec = sections.find((s) => String(s.section_id) === selectedSectionId)
    setEnrolling(true)
    try {
      const res = await api.post<{ added_count: number; total_participants: number }>(
        `/admin/events/${event.id}/participants`,
        { section_id: Number(selectedSectionId) },
      )
      toast(`Enrolled section ${sec?.section_name ?? ''}! (${res.added_count} new participants)`)
      setSelectedSectionId('')
      void loadRoster()
      onUpdated()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Section enrollment failed', 'error')
    } finally {
      setEnrolling(false)
    }
  }

  async function handleEnrollSelectedStudents() {
    if (selectedStudentIds.size === 0) {
      toast('Select at least one student to enroll', 'error')
      return
    }
    setEnrolling(true)
    try {
      const res = await api.post<{ added_count: number; total_participants: number }>(
        `/admin/events/${event.id}/participants`,
        { student_ids: Array.from(selectedStudentIds) },
      )
      toast(`Enrolled ${res.added_count} student(s) to roster!`)
      setSelectedStudentIds(new Set())
      void loadRoster()
      onUpdated()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Student enrollment failed', 'error')
    } finally {
      setEnrolling(false)
    }
  }

  function toggleStudent(studentId: number) {
    if (enrolledStudentIds.has(studentId)) return
    setSelectedStudentIds((prev) => {
      const next = new Set(prev)
      if (next.has(studentId)) {
        next.delete(studentId)
      } else {
        next.add(studentId)
      }
      return next
    })
  }

  function toggleAllStudents() {
    const enrollable = availableStudents.filter((s) => !enrolledStudentIds.has(s.id))
    if (selectedStudentIds.size >= enrollable.length && enrollable.length > 0) {
      setSelectedStudentIds(new Set())
    } else {
      setSelectedStudentIds(new Set(enrollable.map((s) => s.id)))
    }
  }

  return (
    <Modal title={`Participants: ${event.name}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${tab === 'roster' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
          onClick={() => setTab('roster')}
        >
          <Users size={15} /> Registered Roster ({totalParticipants})
        </button>
        <button
          type="button"
          className={`btn ${tab === 'add' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
          onClick={() => setTab('add')}
        >
          <UserPlus size={15} /> + Add Participants
        </button>
      </div>

      {tab === 'roster' ? (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
            <div className="search" style={{ flex: 1, marginBottom: 0 }}>
              <Search size={16} />
              <input
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search participant name, ID code, or section..."
              />
              {rosterSearch ? (
                <button className="icon-btn" onClick={() => setRosterSearch('')} title="Clear search">
                  <X size={16} />
                </button>
              ) : null}
            </div>
            {participants && participants.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => setQrTarget({ studentId: null })}
              >
                <Printer size={16} /> Print All QR Passes ({participants.length})
              </Button>
            ) : null}
          </div>

          {rosterLoading && participants === null ? (
            <TableSkeleton label="Loading roster..." rows={5} columns={[{ label: 'Student', width: '60%' }]} />
          ) : participants && participants.length === 0 ? (
            <EmptyState
              title="No participants found"
              subtitle={rosterSearch ? 'No students match search filter.' : 'No students registered for this event yet.'}
            />
          ) : (
            <div className="card table-card" style={{ maxHeight: '380px', overflowY: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>Name</th>
                    <th>Course & Year</th>
                    <th>Section</th>
                    <th>Session attendance</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {participants?.map((p) => (
                    <tr key={p.student_id}>
                      <td>{p.student_id_code ?? '—'}</td>
                      <td>
                        <strong>{p.last_name}, {p.first_name} {p.middle_name || ''}</strong>
                      </td>
                      <td className="muted">
                        {p.course || '—'} {fmtYearLevel(p.year_level)}
                      </td>
                      <td>{p.section ? <span className="chip chip-window">{p.section}</span> : <span className="muted">—</span>}</td>
                      <td>
                        <div style={{ display: 'grid', gap: '0.3rem', minWidth: '180px' }}>
                          {p.sessions?.map((session) => (
                            <div key={session.session_id} style={{ fontSize: '0.75rem' }}>
                              <strong>{session.session_date} {session.session_name}</strong>{' '}
                              <span className={`chip ${session.status === 'ABSENT' ? 'chip-inactive' : session.status === 'PENDING' ? 'chip-window' : 'chip-active'}`}>
                                {session.status}
                              </span>
                              {session.checked_in_at_utc ? (
                                <div className="muted">
                                  IN {new Date(session.checked_in_at_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  {session.checked_out_at_utc ? ` · OUT ${new Date(session.checked_out_at_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="menu end">
                          <button
                            className="icon-btn"
                            title="View / Print QR Pass"
                            style={{ color: '#0284c7' }}
                            onClick={() => setQrTarget({ studentId: p.student_id })}
                          >
                            <QrCode size={16} />
                          </button>
                          <button
                            className="icon-btn"
                            title="Remove from roster"
                            style={{ color: '#ef4444' }}
                            onClick={() => void handleRemoveParticipant(p.student_id, `${p.first_name} ${p.last_name}`)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Enroll Section Option */}
          <div className="card" style={{ padding: '1rem', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#1e293b' }}>Enroll Entire Section</h4>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <select
                className="filter-control"
                style={{ flex: 1 }}
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
              >
                <option value="">Select section to enroll...</option>
                {sections.map((s) => (
                  <option key={s.section_id} value={s.section_id}>
                    {s.section_name} ({s.student_count} students)
                  </option>
                ))}
              </select>
              <Button onClick={() => void handleEnrollSection()} disabled={!selectedSectionId || enrolling}>
                <Plus size={16} /> {enrolling ? 'Enrolling...' : 'Enroll Section'}
              </Button>
            </div>
          </div>

          {/* Enroll Individual Students Option */}
          <div className="card" style={{ padding: '1rem', background: '#ffffff', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b' }}>Select Specific Students</h4>
              <Button
                onClick={() => void handleEnrollSelectedStudents()}
                disabled={selectedStudentIds.size === 0 || enrolling}
              >
                Enroll Selected ({selectedStudentIds.size})
              </Button>
            </div>

            <div className="search" style={{ marginBottom: '0.75rem' }}>
              <Search size={16} />
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students to select by name or ID number..."
              />
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              {searchLoading ? (
                <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>Searching students...</p>
              ) : availableStudents.length === 0 ? (
                <p className="muted" style={{ padding: '1rem', textAlign: 'center' }}>No students found.</p>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>
                        <button type="button" className="icon-btn" onClick={toggleAllStudents} title="Select/Unselect All">
                          {selectedStudentIds.size >= availableStudents.length && availableStudents.length > 0 ? (
                            <CheckSquare size={16} style={{ color: '#2563eb' }} />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Course & Section</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableStudents.map((s) => {
                      const isAlreadyEnrolled = enrolledStudentIds.has(s.id)
                      const isSelected = selectedStudentIds.has(s.id)
                      return (
                        <tr
                          key={s.id}
                          style={{
                            cursor: isAlreadyEnrolled ? 'default' : 'pointer',
                            background: isAlreadyEnrolled ? '#f1f5f9' : isSelected ? '#eff6ff' : undefined,
                            opacity: isAlreadyEnrolled ? 0.75 : 1,
                          }}
                          onClick={() => toggleStudent(s.id)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            {isAlreadyEnrolled ? (
                              <span className="chip chip-active" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                                Enrolled
                              </span>
                            ) : (
                              <button type="button" className="icon-btn" onClick={() => toggleStudent(s.id)}>
                                {isSelected ? <CheckSquare size={16} style={{ color: '#2563eb' }} /> : <Square size={16} />}
                              </button>
                            )}
                          </td>
                          <td>{s.student_id_code}</td>
                          <td>
                            <strong>{s.full_name}</strong>
                          </td>
                          <td className="muted">
                            {s.course || '—'} {s.section ? `(${s.section})` : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {qrTarget ? (
        <ParticipantQrModal
          event={event}
          studentId={qrTarget.studentId}
          onClose={() => setQrTarget(null)}
        />
      ) : null}
    </Modal>
  )
}
