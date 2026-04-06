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

// ─── HUD State ───────────────────────────────────────────────────────────────
export type WidgetId = 'sprint' | 'issues' | 'clock' | 'status'

export interface HUDState {
  activeWidgets: Set<WidgetId>
  connectorData: Record<string, ConnectorData>
  lastCommand: { text: string; timestamp: number } | null
  lastGesture: { type: GestureType; timestamp: number } | null
  configOpen: boolean
  config: CipherConfig
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

// ─── Voice ───────────────────────────────────────────────────────────────────
export interface ParsedCommand {
  action: 'show' | 'hide' | 'hideAll' | 'refresh'
  target?: WidgetId
  raw: string
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
