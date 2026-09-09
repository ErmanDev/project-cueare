export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const TOKEN_KEY = 'ssc_token'
const USER_KEY = 'ssc_user'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): string | null {
  return localStorage.getItem(USER_KEY)
}

export function setSession(token: string, userJson: string): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, userJson)
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

type Query = Record<string, string | number | boolean | undefined>

function qs(query?: Query): string {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  query?: Query,
): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`/api${path}${qs(query)}`, { ...init, headers })
  const text = await res.text()
  if (res.status === 401) {
    clearSession()
    window.dispatchEvent(new Event('ssc-auth-expired'))
  }
  if (!res.ok) {
    let message = res.statusText || 'Request failed'
    try {
      const body = JSON.parse(text) as { error?: string }
      if (body.error) message = body.error
    } catch {
      if (text) message = text
    }
    throw new ApiError(message, res.status)
  }
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, { method: 'GET' }, query),
  post: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }, query),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path: string, query?: Query) =>
    request<void>(path, { method: 'DELETE' }, query),
  getText: async (path: string, query?: Query) => {
    const headers = new Headers()
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`/api${path}${qs(query)}`, { headers })
    const text = await res.text()
    if (!res.ok) throw new ApiError(text || res.statusText, res.status)
    return text
  },
}
