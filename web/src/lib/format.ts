export function ymd(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayYmd(): string {
  return ymd(new Date())
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const dateShortFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const weekdayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

function asDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d
}

export function fmtDate(d: Date | string): string {
  return dateFmt.format(asDate(d))
}

export function fmtDateShort(d: Date | string): string {
  return dateShortFmt.format(asDate(d))
}

export function fmtTime(d: Date | string): string {
  return timeFmt.format(asDate(d))
}

export function fmtDateTime(d: Date | string): string {
  return dateTimeFmt.format(asDate(d))
}

export function fmtWeekday(d: Date | string): string {
  return weekdayFmt.format(asDate(d))
}

export function fmtHhmm(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  if (h == null || m == null) return hhmm
  const hour = Number(h)
  const min = Number(m)
  if (Number.isNaN(hour) || Number.isNaN(min)) return hhmm
  return timeFmt.format(new Date(2000, 0, 1, hour, min))
}

export function fmtRange(start: string, end: string): string {
  return `${fmtHhmm(start)} – ${fmtHhmm(end)}`
}

export function isToday(d: Date | string): boolean {
  return ymd(d) === todayYmd()
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

export function initial(name: string): string {
  return name.trim() ? name.trim()[0]!.toUpperCase() : '?'
}
