import { CalendarDays, ClipboardCheck, GraduationCap, IdCard } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useAuth } from '../../lib/auth'
import { initial } from '../../lib/format'

const tiles = [
  {
    to: '/superadmin/events',
    icon: CalendarDays,
    title: 'Events & Sessions',
    subtitle: 'Create events and Morning / Afternoon windows',
  },
  {
    to: '/superadmin/students',
    icon: GraduationCap,
    title: 'Students',
    subtitle: 'Add, import, edit, and view QR codes',
  },
  {
    to: '/superadmin/moderators',
    icon: IdCard,
    title: 'Moderators',
    subtitle: 'Accounts that scan attendance',
  },
  {
    to: '/superadmin/attendance',
    icon: ClipboardCheck,
    title: 'Attendance Records',
    subtitle: 'Filter, correct, delete, export CSV',
  },
]

export function AdminDashboard() {
  const { user } = useAuth()

  return (
    <div className="home">
      <div className="page-head">
        <div>
          <h2>Superadmin</h2>
          <p>Manage events, students, scanners, and records</p>
        </div>
      </div>
      <div className="card welcome-card">
        <div className="avatar lg">{initial(user?.name ?? 'A')}</div>
        <div>
          <h3>Welcome, {user?.name ?? 'Admin'}</h3>
          <p className="muted">@{user?.username}</p>
        </div>
      </div>
      <nav className="home-tiles" aria-label="Admin sections">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="card card-click">
            <div className="icon-badge">
              <t.icon size={22} />
            </div>
            <div className="grow">
              <strong>{t.title}</strong>
              <p className="muted">{t.subtitle}</p>
            </div>
          </Link>
        ))}
      </nav>
      <p className="hint home-setup">
        Setup: create an event with sessions → add students → create moderators →
        moderators scan.
      </p>
    </div>
  )
}
