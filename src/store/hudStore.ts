import { createContext, useContext } from 'react'
import type { HUDState, HUDAction, WidgetId } from '../types'
import { DEFAULT_CONFIG } from '../types'

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
      return { ...state, activeWidgets: next }
    }
    case 'HIDE_ALL':
      return { ...state, activeWidgets: new Set<WidgetId>() }
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
