import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api, clearSession, getStoredUser, getToken, setSession } from './api'
import type { Role, User } from './types'

function isStaffRole(role: string | undefined): role is Role {
  return role === 'superadmin' || role === 'moderator'
}

type AuthContextValue = {
  user: User | null
  ready: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setReady(true)
      return
    }
    const cached = getStoredUser()
    if (cached) {
      try {
        setUser(JSON.parse(cached) as User)
      } catch {
        /* ignore */
      }
    }
    api
      .get<{ user: User }>('/auth/me')
      .then((res) => {
        if (!isStaffRole(res.user.role)) {
          clearSession()
          setUser(null)
          return
        }
        setUser(res.user)
        setSession(token, JSON.stringify(res.user))
      })
      .catch(() => {
        clearSession()
        setUser(null)
      })
      .finally(() => setReady(true))

    const onExpired = () => setUser(null)
    window.addEventListener('ssc-auth-expired', onExpired)
    return () => window.removeEventListener('ssc-auth-expired', onExpired)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/auth/login', {
      username,
      password,
    })
    if (!isStaffRole(res.user.role)) {
      throw new Error('Students sign in on the mobile app.')
    }
    setSession(res.token, JSON.stringify(res.user))
    setUser(res.user)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, ready, login, logout }),
    [user, ready, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useRole(): Role | null {
  return useAuth().user?.role ?? null
}
