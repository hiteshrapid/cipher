// CIPHER — CalendarConnector
// Fetches upcoming calendar events from Google Calendar REST API
// Auth is handled server-side by the Vite proxy (see vite.config.ts + .env.local)

import type { Connector } from '../types'

export interface CalendarEvent {
  id:        string
  title:     string
  start:     string   // ISO 8601
  end:       string   // ISO 8601
  location?: string
  attendees: string[]
  isAllDay:  boolean
  meetUrl?:  string
}

export interface CalendarData {
  todayEvents:    CalendarEvent[]
  upcomingEvents: CalendarEvent[]   // next 7 days excluding today
  nextEvent:      CalendarEvent | null
}

export class CalendarConnector implements Connector {
  id    = 'calendar'
  label = 'Calendar'
  private calendarId = 'primary'
  private lookaheadDays = 7

  configure(opts: Record<string, string>) {
    if (opts.calendarId)    this.calendarId    = opts.calendarId
    if (opts.lookaheadDays) this.lookaheadDays = parseInt(opts.lookaheadDays, 10) || 7
  }

  async poll(): Promise<Record<string, unknown>> {
    const events = await this.fetchUpcomingEvents()
    const now    = new Date()

    const todayStart = startOfDay(now)
    const todayEnd   = endOfDay(now)

    const todayEvents: CalendarEvent[] = []
    const upcomingEvents: CalendarEvent[] = []

    for (const ev of events) {
      const evStart = new Date(ev.start)
      if (evStart >= todayStart && evStart <= todayEnd) {
        todayEvents.push(ev)
      } else if (evStart > todayEnd) {
        upcomingEvents.push(ev)
      }
    }

    // Next event = the soonest event that hasn't ended yet
    const nextEvent =
      events.find(ev => new Date(ev.end) > now) ?? null

    const data: CalendarData = { todayEvents, upcomingEvents, nextEvent }
    return data as unknown as Record<string, unknown>
  }

  private async fetchUpcomingEvents(): Promise<CalendarEvent[]> {
    const now       = new Date()
    const timeMin   = encodeURIComponent(now.toISOString())
    const timeMax   = encodeURIComponent(addDays(now, this.lookaheadDays).toISOString())

    const res = await fetch(
      `/gcal/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events` +
      `?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=20`,
      { headers: { 'Content-Type': 'application/json' } }
    )
    if (!res.ok) throw new Error(`Calendar events fetch failed: ${res.status}`)
    const json = await res.json()
    return (json.items ?? []).map(mapEvent)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(raw: any): CalendarEvent {
  const isAllDay = Boolean(raw.start?.date && !raw.start?.dateTime)

  // Google Meet link lives in conferenceData or as a hangoutLink shortcut
  const meetUrl: string | undefined =
    raw.hangoutLink ??
    raw.conferenceData?.entryPoints?.find(
      (ep: { entryPointType: string; uri: string }) => ep.entryPointType === 'video'
    )?.uri

  return {
    id:        raw.id ?? '',
    title:     raw.summary ?? '(no title)',
    start:     raw.start?.dateTime ?? raw.start?.date ?? '',
    end:       raw.end?.dateTime   ?? raw.end?.date   ?? '',
    location:  raw.location,
    attendees: (raw.attendees ?? []).map(
      (a: { email?: string; displayName?: string }) => a.displayName ?? a.email ?? ''
    ),
    isAllDay,
    meetUrl,
  }
}
