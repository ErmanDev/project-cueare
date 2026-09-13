import { type CSSProperties, type FormEvent, type ReactNode, useEffect } from 'react'

import { Logo } from './Logo'

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function EmptyState({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="empty card">
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h3 id="modal-title">{title}</h3>
        {children}
      </div>
    </div>
  )
}

export function FormActions({
  onCancel,
  submitLabel,
  busy,
}: {
  onCancel: () => void
  submitLabel: string
  busy?: boolean
}) {
  return (
    <div className="actions">
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </Button>
    </div>
  )
}

export function onSubmit(fn: () => void | Promise<void>) {
  return (e: FormEvent) => {
    e.preventDefault()
    void fn()
  }
}

const BONE_WIDTHS = ['72%', '54%', '86%', '48%', '64%', '78%', '42%', '70%']

export function Bone({
  width = '100%',
  height = 14,
  radius,
  className = '',
}: {
  width?: string | number
  height?: string | number
  radius?: string | number
  className?: string
}) {
  const style: CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }
  if (radius != null) {
    style.borderRadius = typeof radius === 'number' ? `${radius}px` : radius
  }
  return <span className={`skeleton${className ? ` ${className}` : ''}`} style={style} aria-hidden="true" />
}

export type SkeletonColumn = {
  label: string
  width?: string | number
  variant?: 'text' | 'actions' | 'chip' | 'chips' | 'dir'
  count?: number
}

function SkeletonCell({ column, row }: { column: SkeletonColumn; row: number }) {
  const width = column.width ?? BONE_WIDTHS[(row + column.label.length) % BONE_WIDTHS.length]
  switch (column.variant) {
    case 'actions':
      return (
        <div className="menu end">
          {Array.from({ length: column.count ?? 2 }, (_, i) => (
            <Bone key={i} width={28} height={28} radius={8} />
          ))}
        </div>
      )
    case 'chip':
      return <Bone width={width} height={24} radius={999} />
    case 'chips':
      return (
        <div className="windows">
          <Bone width={110} height={24} radius={999} />
          <Bone width={124} height={24} radius={999} />
        </div>
      )
    case 'dir':
      return <Bone width={44} height={24} radius={8} />
    default:
      return <Bone width={width} height={14} />
  }
}

export function TableSkeleton({
  columns,
  rows = 8,
  tableClass = '',
  label,
  quiet,
  meta = true,
}: {
  columns: SkeletonColumn[]
  rows?: number
  tableClass?: string
  label?: string
  quiet?: boolean
  meta?: boolean
}) {
  return (
    <div
      className="card table-card"
      {...(quiet ? {} : { role: 'status', 'aria-busy': true, 'aria-live': 'polite' as const })}
    >
      {label && !quiet ? <span className="visually-hidden">{label}</span> : null}
      <div className="table-wrap">
        <table className={`data is-skeleton${tableClass ? ` ${tableClass}` : ''}`}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={`${col.label}-${i}`}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                {columns.map((col, i) => (
                  <td key={`${i}-${row}`}>
                    <SkeletonCell column={col} row={row} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta ? (
        <div className="table-meta">
          <Bone width={148} height={12} />
        </div>
      ) : null}
    </div>
  )
}

export function CardListSkeleton({
  count = 5,
  label,
}: {
  count?: number
  label: string
}) {
  return (
    <div className="list" role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <article key={i} className="card row">
          <Bone width={40} height={40} radius="50%" />
          <div className="grow skeleton-stack">
            <Bone width={`${42 + (i % 3) * 8}%`} height={16} />
            <Bone width={`${24 + (i % 2) * 8}%`} height={12} />
          </div>
          <Bone width={32} height={32} radius={8} />
          <Bone width={32} height={32} radius={8} />
        </article>
      ))}
    </div>
  )
}

export function EventPanelSkeleton() {
  return (
    <div className="list" role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading events</span>
      <article className="card welcome-card skeleton-event-card">
        <div className="skeleton-stack grow">
          <Bone width="58%" height={20} />
          <Bone width="34%" height={14} />
          <div className="windows">
            <Bone width={128} height={26} radius={999} />
            <Bone width={140} height={26} radius={999} />
          </div>
        </div>
      </article>
      <div className="skeleton-stack">
        <Bone width={180} height={18} />
        <Bone width={240} height={12} />
        <Bone width="100%" height={44} radius={12} />
      </div>
      <Bone width="100%" height={64} radius={12} />
      <Bone width="100%" height={44} radius={12} />
    </div>
  )
}

export function ScanHistorySkeleton() {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading scans</span>
      <div className="card row stats-row">
        {[0, 1, 2].map((i) => (
          <div key={i} className="stat skeleton-stat">
            <Bone width={36} height={22} />
            <Bone width={48} height={12} />
          </div>
        ))}
      </div>
      <TableSkeleton
        quiet
        meta={false}
        rows={6}
        columns={[
          { label: 'Dir', variant: 'dir', width: 44 },
          { label: 'Student', width: '68%' },
          { label: 'Session', width: '52%' },
          { label: 'When', width: '60%' },
        ]}
      />
    </div>
  )
}

export function LoginFormSkeleton() {
  return (
    <div className="form-grid login-form" role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Checking your session</span>
      <div className="field">
        <Bone width={72} height={11} />
        <Bone width="100%" height={44} radius={12} />
      </div>
      <div className="field">
        <Bone width={64} height={11} />
        <Bone width="100%" height={44} radius={12} />
      </div>
      <Bone width="100%" height={44} radius={12} />
    </div>
  )
}

export function BootSkeleton() {
  return (
    <div className="app-shell" role="status" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading</span>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo size={40} className="sidebar-logo" />
          <div className="skeleton-stack">
            <Bone width={118} height={14} />
            <Bone width={86} height={10} />
          </div>
        </div>
        <nav className="skeleton-nav">
          {[72, 58, 80, 66, 90].map((w, i) => (
            <div key={i} className="nav-link">
              <Bone width={18} height={18} radius={6} />
              <Bone width={w} height={12} />
            </div>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-user">
          <Bone width={40} height={40} radius="50%" />
          <div className="grow skeleton-stack">
            <Bone width="70%" height={12} />
            <Bone width="46%" height={10} />
          </div>
        </div>
      </aside>
      <main className="content">
        <div className="page">
          <div className="home">
            <div className="page-head">
              <div className="skeleton-stack">
                <Bone width={168} height={28} />
                <Bone width={240} height={14} />
              </div>
              <div className="home-now">
                <Bone width={88} height={24} />
                <Bone width={148} height={12} />
              </div>
            </div>
            <div className="card welcome-card">
              <Bone width={52} height={52} radius="50%" />
              <div className="skeleton-stack grow">
                <Bone width="44%" height={18} />
                <Bone width="26%" height={12} />
              </div>
            </div>
            <div className="card cal-board" aria-hidden="true">
              <div className="cal-toolbar">
                <Bone width={160} height={22} />
                <Bone width={120} height={32} radius={10} />
              </div>
              <div className="cal-grid">
                {Array.from({ length: 14 }, (_, i) => (
                  <div key={i} className="cal-day">
                    <Bone width={18} height={12} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
