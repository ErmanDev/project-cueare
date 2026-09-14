import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  History,
  IdCard,
  Layers,
  LayoutDashboard,
  LogOut,
  QrCode,
  Scale,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { initial } from '../lib/format'
import { Logo } from './Logo'

const adminNav = [
  { to: '/superadmin', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/superadmin/events', label: 'Events', icon: CalendarDays },
  { to: '/superadmin/fines', label: 'Fines', icon: Scale },
  { to: '/superadmin/academics', label: 'Academics', icon: Layers },
  { to: '/superadmin/students', label: 'Students', icon: GraduationCap },
  { to: '/superadmin/moderators', label: 'Moderators', icon: IdCard },
  { to: '/superadmin/attendance', label: 'Attendance', icon: ClipboardCheck },
]

const moderatorNav = [
  { to: '/scanner', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/scanner/scan', label: 'Scan', icon: QrCode },
  { to: '/scanner/history', label: 'My scans', icon: History },
]

export function Shell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const nav = user?.role === 'superadmin' ? adminNav : moderatorNav

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo size={40} className="sidebar-logo" />
          <div>
            <h1>SSC Attendance</h1>
            <small>ACSSCO Bukidnon</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        {user ? (
          <div className="sidebar-user">
            <div className="avatar" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
              {initial(user.name)}
            </div>
            <div className="grow">
              <strong>{user.name}</strong>
              <span>{user.role === 'superadmin' ? 'Superadmin' : 'Moderator'}</span>
            </div>
            <button
              className="icon-btn"
              title="Sign out"
              onClick={() => {
                if (window.confirm('Sign out? You will need to log in again.')) {
                  logout()
                  navigate('/login', { replace: true })
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : null}
      </aside>
      <main className="content">
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
