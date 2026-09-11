import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { Shell } from './components/Shell'
import { BootSkeleton } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import { ModeratorProvider } from './lib/moderator'
import { ToastProvider } from './lib/toast'
import type { Role } from './lib/types'
import { AdminAttendance } from './pages/admin/Attendance'
import { AdminDashboard } from './pages/admin/Dashboard'
import { AdminEvents } from './pages/admin/Events'
import { AdminModerators } from './pages/admin/Moderators'
import { AdminStudents } from './pages/admin/Students'
import { LoginPage } from './pages/Login'
import { ModeratorDashboard } from './pages/moderator/Dashboard'
import { ModeratorHistory } from './pages/moderator/History'
import { ModeratorScan } from './pages/moderator/Scan'

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <BootSkeleton />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) {
    return <Navigate to={user.role === 'superadmin' ? '/superadmin' : '/scanner'} replace />
  }
  return children
}

function AdminLayout() {
  return (
    <RequireRole role="superadmin">
      <Shell />
    </RequireRole>
  )
}

function ModeratorLayout() {
  return (
    <RequireRole role="moderator">
      <ModeratorProvider>
        <Shell />
      </ModeratorProvider>
    </RequireRole>
  )
}

function HomeRedirect() {
  const { user, ready } = useAuth()
  if (!ready) return <BootSkeleton />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'superadmin' ? '/superadmin' : '/scanner'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/superadmin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="moderators" element={<AdminModerators />} />
            <Route path="attendance" element={<AdminAttendance />} />
          </Route>
          <Route path="/scanner" element={<ModeratorLayout />}>
            <Route index element={<ModeratorDashboard />} />
            <Route path="scan" element={<ModeratorScan />} />
            <Route path="history" element={<ModeratorHistory />} />
          </Route>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  )
}
