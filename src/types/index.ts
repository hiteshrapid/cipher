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

// ─── Jira ────────────────────────────────────────────────────────────────────
export interface JiraIssue {
  key: string
  summary: string
  status: string
  priority: string
  assignee?: string
}

export interface SprintData {
  sprintName: string
  openCount: number
  doneCount: number
  totalCount: number
  issues: JiraIssue[]
}

export interface SearchResult {
  query:    string
  title:    string
  abstract: string
  source:   string
  url?:     string
}

// ─── HUD State ───────────────────────────────────────────────────────────────
export type WidgetId = 'sprint' | 'issues' | 'clock' | 'status' | 'search'

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
  | { type: 'SET_ALERT_LEVEL';   level: 'NORMAL' | 'ALERT' | 'CRITICAL' | 'STEALTH' }
  | { type: 'SEARCH_QUERY';      query: string }
  | { type: 'SET_SEARCH_RESULT'; result: SearchResult | null; loading?: boolean }

// ─── Voice ───────────────────────────────────────────────────────────────────
export interface ParsedCommand {
  action: 'show' | 'hide' | 'hideAll' | 'refresh' | 'search'
  target?: WidgetId
  query?:  string
  raw:     string
}

// ─── Gestures ────────────────────────────────────────────────────────────────
export type GestureType = 'open_palm' | 'pinch' | 'swipe_left' | 'swipe_right'

// ─── Config ──────────────────────────────────────────────────────────────────
export interface CipherConfig {
  jiraConfigured: boolean
  voiceEnabled: boolean
  gestureEnabled: boolean
}

export const DEFAULT_CONFIG: CipherConfig = {
  jiraConfigured: false,
  voiceEnabled: true,
  gestureEnabled: true,
}
