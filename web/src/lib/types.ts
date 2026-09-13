export type Role = 'superadmin' | 'moderator'

export type User = {
  id: number
  name: string
  username: string
  role: Role
  created_at?: string
}

export type Student = {
  id: number
  student_id_code: string
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  full_name: string
  course?: string | null
  year_level?: number | null
  section: string | null
  photo_url: string | null
  qr_payload?: string | null
}

export type EventParticipant = {
  student_id: number
  student_id_code: string | null
  first_name: string
  middle_name: string | null
  last_name: string
  course: string | null
  year_level: number | null
  section: string | null
  added_at: string
}

export type EventParticipantToken = {
  token_id: number
  event_id: number
  student_id: number
  token: string
  is_revoked: boolean
  issued_by_user_id: number
  issued_at_utc: string
  revoked_at_utc: string | null
  revoked_by_user_id: number | null
  student_id_code: string | null
  first_name: string
  last_name: string
  middle_name: string | null
  course: string | null
  year_level: number | null
  section: string | null
}

export type StudentPage = {
  students: Student[]
  total: number
  page: number
  per_page: number
}

export type SessionWindow = {
  id: number
  event_id: number
  session_label: string
  start_time: string
  end_time: string
  late_after?: string | null
  in_end?: string | null
  out_start?: string | null
  out_end?: string | null
  requires_checkout?: boolean
  sort_order: number
}

export type EventFineSummary = {
  policy_id: number
  policy_name: string
  template_id: number | null
  template_name: string | null
  version_id?: number | null
  max_fine_per_student: number | null
}

export type Event = {
  id: number
  name: string
  event_date: string
  is_active: boolean
  is_expired?: boolean
  created_by?: number
  session_windows: SessionWindow[]
  is_today?: boolean
  current_session_window_id?: number | null
  fine_policy?: EventFineSummary | null
  participant_count?: number
}

export type AttendanceLog = {
  id: number
  event_id: number
  student_id: number
  session_window_id: number
  direction: 'IN' | 'OUT'
  scanned_at: string
  scanned_by: number
  status: 'confirmed' | 'cancelled'
  device_note: string | null
  student_id_code?: string | null
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  student_name?: string | null
  course?: string | null
  year_level?: number | null
  student_section?: string | null
  session_label?: string | null
  scanned_by_name?: string | null
  event_name?: string | null
}

export type ScanPreview = {
  student: Student
  event: { id: number; name: string }
  computed_session: {
    id: number
    session_label: string
    start_time: string
    end_time: string
    mode: 'auto' | 'manual'
  }
  computed_direction: 'IN' | 'OUT' | 'ALREADY_COMPLETE'
  can_confirm: boolean
  server_time: string
  existing_scans: { direction: string; scanned_at: string }[]
  message?: string | null
}

export type AttendanceQuery = {
  event_id?: number
  date?: string
  session_window_id?: number
  status?: string
  q?: string
}

export type ImportResult = {
  created?: number
  updated?: number
  skipped?: number
  errors?: unknown[]
  total_rows?: number
}

export type WindowDraft = {
  id?: number
  label: string
  start: string
  end: string
  late_after?: string
  in_end?: string
  out_start?: string
  out_end?: string
}

export type FineTemplateRule = {
  rule_id?: number
  session_type_code: string
  violation_code: string
  fine_amount: number
  priority_order: number
}

export type FineTemplateVersion = {
  version_id: number
  version_number: number
  version_status_code: 'DRAFT' | 'PUBLISHED' | 'RETIRED' | string | null
  currency_code: string | null
  max_fine_per_student: number | null
  rules: FineTemplateRule[]
}

export type FineTemplate = {
  template_id: number
  template_code: string
  template_name: string
  description: string | null
  is_active: boolean
  active_version: FineTemplateVersion | null
}

export type Section = {
  section_id: number
  section_code: string
  section_name: string | null
  year_level: number
  academic_term_id: number
  term_code: string
  term_name: string
  academic_year_id?: number
  year_code?: string
  year_name?: string
  academic_program_id: number
  program_code: string
  program_name: string
  enrolled_student_count: number
}

export type SectionStudent = {
  student_id: number
  student_number: string
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
  student_enrollment_id: number
  enrollment_status_code: string
  effective_from_utc: string
}

export type SectionBreakdown = Section & {
  students: SectionStudent[]
}

