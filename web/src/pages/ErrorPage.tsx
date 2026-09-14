import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../components/ui'
import { useAuth } from '../lib/auth'

export type ErrorKind = 'not-found' | 'crash'

function homePath(role: string | undefined) {
  if (role === 'superadmin') return '/superadmin'
  if (role === 'moderator') return '/scanner'
  return '/login'
}

export function ErrorPage({
  kind = 'not-found',
  onRetry,
}: {
  kind?: ErrorKind
  onRetry?: () => void
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const home = homePath(user?.role)
  const missing = kind === 'not-found'
  const signedIn = Boolean(user)

  const title = missing ? "This page isn't here" : 'Something broke'
  const body = missing
    ? "That address doesn't match a page in SSC QR Attendance. You can go back, or return home."
    : 'The page hit an unexpected error. You can try again, or go back to where you were.'
  const primaryLabel = missing
    ? signedIn
      ? 'Take me home'
      : 'Log in'
    : 'Try again'

  useEffect(() => {
    document.title = `${title} · SSC QR Attendance`
    return () => {
      document.title = 'SSC QR Attendance'
    }
  }, [title])

  function goHome() {
    navigate(home, { replace: true })
  }

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    goHome()
  }

  function onPrimary() {
    if (!missing && onRetry) {
      onRetry()
      return
    }
    goHome()
  }

  return (
    <main className="error-page" aria-labelledby="error-title">
      <div className="error-ground" aria-hidden="true" />
      <section className="error-card">
        <img
          className="error-crest"
          src="/error-crest.png"
          alt="ACSSCO Bukidnon Campus logo"
          width={128}
          height={128}
          decoding="async"
          draggable={false}
        />
        <h1 id="error-title">{title}</h1>
        <p className="error-body">{body}</p>
        <div className="error-actions">
          <Button type="button" className="error-primary" onClick={onPrimary}>
            {primaryLabel}
          </Button>
          <button type="button" className="btn btn-ghost error-back" onClick={goBack}>
            Go back
          </button>
        </div>
      </section>
    </main>
  )
}
