import { type FormEvent, type ReactNode } from 'react'

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
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
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
