// ─── Geometry ────────────────────────────────────────────────────────────────
export interface Point { x: number; y: number }
export interface Size  { w: number; h: number }

// ─── Connectors ──────────────────────────────────────────────────────────────
export type ConnectorStatus = 'idle' | 'loading' | 'connected' | 'error'

export interface ConnectorData {
  id: string
  label: string
  status: ConnectorStatus
  data: Record<string, unknown>
  lastUpdated: number
  errorMessage?: string
}

export interface Connector {
  id: string
  label: string
  configure(opts: Record<string, string>): void
  poll(): Promise<Record<string, unknown>>
}

// ─── GitHub ──────────────────────────────────────────────────────────────────
export interface GitHubPR {
  number: number
  title: string
  state: string
  author: string
  reviewers: string[]
  url: string
  updatedAt: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: string
  labels: string[]
  url: string
  updatedAt: string
}

export interface GitHubData {
  openPRs: GitHubPR[]
  reviewRequested: GitHubPR[]
  assignedIssues: GitHubIssue[]
}

// ─── Calendar ────────────────────────────────────────────────────────────────
export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  location?: string
  attendees: string[]
  isAllDay: boolean
  meetUrl?: string
}

export interface CalendarData {
  todayEvents: CalendarEvent[]
  upcomingEvents: CalendarEvent[]
  nextEvent: CalendarEvent | null
}

// ─── Linear ──────────────────────────────────────────────────────────────────
export interface LinearTicket {
  id: string
  identifier: string
  title: string
  state: string
  priority: number
  url: string
}

export interface LinearData {
  assignedTickets: LinearTicket[]
  projectName: string
  isMock?: boolean
}

// ─── Slack ───────────────────────────────────────────────────────────────────
export interface SlackMessage {
  channel: string
  author: string
  text: string
  timestamp: string
  isDM: boolean
}

export interface SlackData {
  unreadCount: number
  mentions: SlackMessage[]
  recentDMs: SlackMessage[]
  isMock?: boolean
}

// ─── Gmail ───────────────────────────────────────────────────────────────────
export interface GmailThread {
  id: string
  subject: string
  from: string
  snippet: string
  timestamp: string
  unread: boolean
}

export interface GmailData {
  unreadCount: number
  recentThreads: GmailThread[]
  isMock?: boolean
}

// ─── Notifications & Activity ────────────────────────────────────────────────
export interface NotificationItem {
  source: 'slack' | 'gmail' | 'github'
  text: string
  timestamp: number
  priority: 'low' | 'normal' | 'high'
}

export interface ActivityItem {
  source: string
  text: string
  timestamp: number
  icon: string
}

// ─── Search ──────────────────────────────────────────────────────────────────
export interface SearchResult {
  query:    string
  title:    string
  abstract: string
  source:   string
  url?:     string
  bullets?: string[]  // 3–5 key sentences for the Iron Man Intel Card
}

// ─── Voice ───────────────────────────────────────────────────────────────────
export type VoiceStatus = 'inactive' | 'listening' | 'error' | 'denied'

export interface ParsedCommand {
  action: 'show' | 'hide' | 'hideAll' | 'refresh' | 'search'
  target?: WidgetId
  query?:  string
  raw:     string
}

// ─── Gestures ────────────────────────────────────────────────────────────────
export type GestureType = 'open_palm' | 'pinch' | 'swipe_left' | 'swipe_right'

// ─── HUD State ───────────────────────────────────────────────────────────────
export type WidgetId =
  | 'sprint' | 'issues' | 'clock' | 'status' | 'search'
  | 'github' | 'calendar' | 'notifications' | 'activity' | 'metrics'

export type AlertLevel = 'NORMAL' | 'ALERT' | 'CRITICAL' | 'STEALTH'

export interface HUDState {
  activeWidgets: Set<WidgetId>
  connectorData: Record<string, ConnectorData>
  lastCommand: { text: string; timestamp: number } | null
  lastGesture: { type: GestureType; timestamp: number } | null
  configOpen: boolean
  config: CipherConfig
  stealthMode: boolean
  alertLevel: AlertLevel
  searchQuery:   string | null
  searchResult:  SearchResult | null
  searchLoading: boolean
  voiceStatus: VoiceStatus
  notifications: NotificationItem[]
  activityFeed: ActivityItem[]
  transcriptPanel: { active: boolean; x: number; y: number; text: string }
}

export type HUDAction =
  | { type: 'SHOW_WIDGET';       id: WidgetId }
  | { type: 'HIDE_WIDGET';       id: WidgetId }
  | { type: 'HIDE_ALL' }
  | { type: 'UPDATE_CONNECTOR';  id: string; data: ConnectorData }
  | { type: 'COMMAND_RECEIVED';  text: string }
  | { type: 'GESTURE_DETECTED';  gesture: GestureType }
  | { type: 'TOGGLE_CONFIG' }
  | { type: 'SET_CONFIG';        config: Partial<CipherConfig> }
  | { type: 'TOGGLE_STEALTH' }
  | { type: 'SET_ALERT_LEVEL';   level: AlertLevel }
  | { type: 'SEARCH_QUERY';      query: string }
  | { type: 'SET_SEARCH_RESULT'; result: SearchResult | null; loading?: boolean }
  | { type: 'SET_VOICE_STATUS';  status: VoiceStatus }
  | { type: 'ADD_NOTIFICATION';  item: NotificationItem }
  | { type: 'ADD_ACTIVITY';      item: ActivityItem }
  | { type: 'TOGGLE_TRANSCRIPT'; x: number; y: number }
  | { type: 'UPDATE_TRANSCRIPT'; text: string }

// ─── Config ──────────────────────────────────────────────────────────────────
export interface CipherConfig {
  githubConfigured: boolean
  calendarConfigured: boolean
  linearConfigured: boolean
  slackConfigured: boolean
  gmailConfigured: boolean
  voiceEnabled: boolean
  gestureEnabled: boolean
}

export const DEFAULT_CONFIG: CipherConfig = {
  githubConfigured: false,
  calendarConfigured: false,
  linearConfigured: false,
  slackConfigured: false,
  gmailConfigured: false,
  voiceEnabled: true,
  gestureEnabled: true,
}
