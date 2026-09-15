import { useEffect, useId, useRef, useState } from 'react'
import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  History,
  IdCard,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Scale,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { initial } from '../lib/format'
import { ConfirmDialog } from './ui'
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
  const sidebarId = useId()
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [navOpen, setNavOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const nav = user?.role === 'superadmin' ? adminNav : moderatorNav

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    function onChange() {
      if (!mq.matches) setNavOpen(false)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!navOpen) return
    const menuBtn = menuBtnRef.current
    const sidebar = sidebarRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setNavOpen(false)
        return
      }
      if (e.key !== 'Tab' || !sidebar) return
      const focusable = sidebar.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
      menuBtn?.focus()
    }
  }, [navOpen])

  function signOut() {
    setSignOutOpen(true)
  }

  function confirmSignOut() {
    setSignOutOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={`app-shell${navOpen ? ' is-nav-open' : ''}`}>
      <header className="shell-bar">
        <button
          ref={menuBtnRef}
          type="button"
          className="icon-btn shell-menu"
          aria-expanded={navOpen}
          aria-controls={sidebarId}
          onClick={() => setNavOpen(true)}
        >
          <Menu size={22} />
          <span className="visually-hidden">Open menu</span>
        </button>
        <div className="shell-bar-brand">
          <Logo size={32} className="sidebar-logo shell-bar-logo" />
          <strong>SSC Attendance</strong>
        </div>
        {user ? (
          <button type="button" className="icon-btn" title="Sign out" onClick={signOut}>
            <LogOut size={18} />
            <span className="visually-hidden">Sign out</span>
          </button>
        ) : (
          <span className="shell-bar-slot" aria-hidden="true" />
        )}
      </header>
      <div
        className="sidebar-scrim"
        hidden={!navOpen}
        onClick={() => setNavOpen(false)}
      />
      <aside
        id={sidebarId}
        ref={sidebarRef}
        className="sidebar"
        {...(navOpen ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menu' } : {})}
      >
        <div className="sidebar-drawer-head">
          <button
            ref={closeBtnRef}
            type="button"
            className="icon-btn sidebar-close"
            onClick={() => setNavOpen(false)}
          >
            <X size={22} />
            <span className="visually-hidden">Close menu</span>
          </button>
        </div>
        <div className="sidebar-brand">
          <Logo size={40} className="sidebar-logo" />
          <div>
            <h1>SSC Attendance</h1>
            <small>ACSSCO Bukidnon</small>
          </div>
        </div>
        <nav aria-label="Main">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={() => setNavOpen(false)}
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
            <button className="icon-btn" title="Sign out" onClick={signOut}>
              <LogOut size={18} />
              <span className="visually-hidden">Sign out</span>
            </button>
          </div>
        ) : null}
      </aside>
      <main className="content">
        <div className="page">
          <Outlet />
        </div>
      </main>
      {signOutOpen ? (
        <ConfirmDialog
          title="Sign out?"
          message="You will need to log in again."
          confirmLabel="Sign out"
          onCancel={() => setSignOutOpen(false)}
          onConfirm={confirmSignOut}
        />
      ) : null}
    </div>
  )
}
