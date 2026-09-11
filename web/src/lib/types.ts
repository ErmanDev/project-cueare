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
  sort_order: number
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
}
