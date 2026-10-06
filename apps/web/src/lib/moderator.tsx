import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { api } from './api'
import type { Event } from './types'

type ModeratorContextValue = {
  events: Event[]
  selected: Event | null
  select: (id: number) => void
  override: number | null
  setOverride: (id: number | null) => void
  reload: () => Promise<void>
  loading: boolean
  error: string | null
}

const ModeratorContext = createContext<ModeratorContextValue | null>(null)

export function ModeratorProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [override, setOverride] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ events: Event[] }>('/moderator/events/active')
      setEvents(res.events)
      setSelectedId((prev) => {
        if (prev && res.events.some((e) => e.id === prev)) return prev
        return res.events[0]?.id ?? null
      })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const selected = events.find((e) => e.id === selectedId) ?? null

  const value = useMemo(
    () => ({
      events,
      selected,
      select: setSelectedId,
      override,
      setOverride,
      reload,
      loading,
      error,
    }),
    [events, selected, override, reload, loading, error],
  )

  return <ModeratorContext.Provider value={value}>{children}</ModeratorContext.Provider>
}

export function useModerator(): ModeratorContextValue {
  const ctx = useContext(ModeratorContext)
  if (!ctx) throw new Error('useModerator must be used within ModeratorProvider')
  return ctx
}
