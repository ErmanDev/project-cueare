export function ymd(d: Date | string | null | undefined): string {
  const date = asDate(d)
  if (!date) return ''
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

function asDate(d: Date | string | null | undefined): Date | null {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d
  if (typeof d !== 'string' || !d.trim()) return null
  const date = new Date(d)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(fmt: Intl.DateTimeFormat, d: Date | string | null | undefined): string {
  const date = asDate(d)
  return date ? fmt.format(date) : '—'
}

export function fmtDate(d: Date | string | null | undefined): string {
  return formatDate(dateFmt, d)
}

export function fmtDateShort(d: Date | string | null | undefined): string {
  return formatDate(dateShortFmt, d)
}

export function fmtTime(d: Date | string | null | undefined): string {
  return formatDate(timeFmt, d)
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  return formatDate(dateTimeFmt, d)
}

export function fmtWeekday(d: Date | string | null | undefined): string {
  return formatDate(weekdayFmt, d)
}

export function fmtHhmm(hhmm: string): string {
  if (!hhmm) return '—'
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

export function isToday(d: Date | string | null | undefined): boolean {
  const value = ymd(d)
  return value !== '' && value === todayYmd()
}

export function minutes(hhmm: string | null | undefined): number {
  if (!hhmm) return Number.NaN
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

export function hhmmFromMinutes(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${h}:${m}`
}

export function initial(name: string): string {
  return name.trim() ? name.trim()[0]!.toUpperCase() : '?'
}

export function fmtYearLevel(level: number | null | undefined): string {
  if (level == null || !Number.isFinite(level)) return '—'
  const teens = level % 100
  const suffix =
    teens >= 11 && teens <= 13
      ? 'th'
      : level % 10 === 1
        ? 'st'
        : level % 10 === 2
          ? 'nd'
          : level % 10 === 3
            ? 'rd'
            : 'th'
  return `${level}${suffix} Year`
}

const phpFmt = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function phpAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return phpFmt.format(value)
}
