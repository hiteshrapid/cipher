import { createContext, useContext } from 'react'
import type { HUDState, HUDAction, WidgetId, NotificationItem, ActivityItem } from '../types'
import { DEFAULT_CONFIG } from '../types'

const MAX_NOTIFICATIONS = 20
const MAX_ACTIVITY = 30

// ─── Initial State ────────────────────────────────────────────────────────────
export const initialHUDState: HUDState = {
  activeWidgets: new Set<WidgetId>(),
  connectorData: {},
  lastCommand:   null,
  lastGesture:   null,
  configOpen:    false,
  config:        { ...DEFAULT_CONFIG },
  stealthMode:   false,
  alertLevel:    'NORMAL',
  searchQuery:   null,
  searchResult:  null,
  searchLoading: false,
  voiceStatus:   'inactive',
  notifications: [],
  activityFeed:  [],
  transcriptPanel: { active: false, x: 0, y: 0, text: '' },
}

// ─── Reducer ─────────────────────────────────────────────────────────────────
export function hudReducer(state: HUDState, action: HUDAction): HUDState {
  switch (action.type) {
    case 'SHOW_WIDGET': {
      const next = new Set(state.activeWidgets)
      next.add(action.id)
      return { ...state, activeWidgets: next }
    }
    case 'HIDE_WIDGET': {
      const next = new Set(state.activeWidgets)
      next.delete(action.id)
      return {
        ...state,
        activeWidgets: next,
        ...(action.id === 'search' ? { searchQuery: null, searchResult: null } : {}),
      }
    }
    case 'HIDE_ALL':
      return { ...state, activeWidgets: new Set<WidgetId>(), searchQuery: null, searchResult: null, transcriptPanel: { active: false, x: 0, y: 0, text: '' } }
    case 'UPDATE_CONNECTOR':
      return {
        ...state,
        connectorData: { ...state.connectorData, [action.id]: action.data },
      }
    case 'COMMAND_RECEIVED':
      return { ...state, lastCommand: { text: action.text, timestamp: Date.now() } }
    case 'GESTURE_DETECTED':
      return { ...state, lastGesture: { type: action.gesture, timestamp: Date.now() } }
    case 'TOGGLE_CONFIG':
      return { ...state, configOpen: !state.configOpen }
    case 'SET_CONFIG':
      return { ...state, config: { ...state.config, ...action.config } }
    case 'TOGGLE_STEALTH':
      return {
        ...state,
        stealthMode: !state.stealthMode,
        alertLevel: !state.stealthMode ? 'STEALTH' : 'NORMAL',
      }
    case 'SET_ALERT_LEVEL':
      return { ...state, alertLevel: action.level }
    case 'SEARCH_QUERY': {
      const next = new Set(state.activeWidgets)
      next.add('search')
      return {
        ...state,
        searchQuery:   action.query,
        searchLoading: true,
        searchResult:  null,
        activeWidgets: next,
      }
    }
    case 'SET_SEARCH_RESULT':
      return {
        ...state,
        searchResult:  action.result,
        searchLoading: action.loading ?? false,
      }
    case 'SET_VOICE_STATUS':
      return { ...state, voiceStatus: action.status }
    case 'ADD_NOTIFICATION': {
      const notifications = [action.item, ...state.notifications].slice(0, MAX_NOTIFICATIONS) as NotificationItem[]
      return { ...state, notifications }
    }
    case 'ADD_ACTIVITY': {
      const activityFeed = [action.item, ...state.activityFeed].slice(0, MAX_ACTIVITY) as ActivityItem[]
      return { ...state, activityFeed }
    }
    case 'TOGGLE_TRANSCRIPT':
      if (state.transcriptPanel.active) {
        return { ...state, transcriptPanel: { active: false, x: 0, y: 0, text: '' } }
      }
      return { ...state, transcriptPanel: { active: true, x: action.x, y: action.y, text: '' } }
    case 'UPDATE_TRANSCRIPT':
      if (!state.transcriptPanel.active) return state
      return {
        ...state,
        transcriptPanel: {
          ...state.transcriptPanel,
          text: action.text.slice(-120),
        },
      }
    default:
      return state
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────
export interface HUDContextValue {
  state: HUDState
  dispatch: React.Dispatch<HUDAction>
}

export const HUDContext = createContext<HUDContextValue | null>(null)

export function useHUD(): HUDContextValue {
  const ctx = useContext(HUDContext)
  if (!ctx) throw new Error('useHUD must be used inside HUDContext.Provider')
  return ctx
}
