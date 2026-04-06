// CIPHER — App root
// Provides HUD context, mounts canvas + floating controls + settings drawer

import { useReducer, useRef } from 'react'
import { HUDContext, hudReducer, initialHUDState } from './store/hudStore'
import { HUDCanvas } from './canvas/HUDCanvas'
import { ConfigDrawer } from './components/ConfigDrawer'
import type { HUDState } from './types'

const ALERT_COLORS: Record<string, string> = {
  NORMAL:   'rgba(0, 255, 65, 0.8)',
  STEALTH:  'rgba(0, 200, 50, 0.4)',
  ALERT:    'rgba(255, 160, 0, 0.9)',
  CRITICAL: 'rgba(255, 50, 50, 0.95)',
}

const HUD_BTN: React.CSSProperties = {
  background:    'rgba(0, 20, 0, 0.75)',
  border:        '1px solid rgba(0, 255, 65, 0.30)',
  color:         'rgba(0, 255, 65, 0.8)',
  fontFamily:    "'Courier New', monospace",
  fontSize:      10,
  padding:       '5px 13px',
  cursor:        'pointer',
  borderRadius:  2,
  letterSpacing: '1px',
  backdropFilter: 'blur(4px)',
}

export default function App() {
  const [state, dispatch] = useReducer(hudReducer, initialHUDState)
  const stateRef = useRef<HUDState>(state)
  stateRef.current = state

  const alertColor = ALERT_COLORS[state.alertLevel] ?? ALERT_COLORS.NORMAL

  return (
    <HUDContext.Provider value={{ state, dispatch }}>
      <HUDCanvas />

      {/* ── Top-left: settings + stealth ───────────────────────────── */}
      <div style={{ position: 'fixed', top: 20, left: 20, display: 'flex', gap: 8, zIndex: 50 }}>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_CONFIG' })}
          style={{ ...HUD_BTN, color: alertColor, borderColor: alertColor.replace('0.8', '0.35') }}
        >
          ⚙ CIPHER
        </button>

        <button
          title="Toggle stealth mode (hides HUD chrome)"
          onClick={() => dispatch({ type: 'TOGGLE_STEALTH' })}
          style={{
            ...HUD_BTN,
            color:       state.stealthMode ? 'rgba(0, 200, 50, 0.5)' : 'rgba(0, 255, 65, 0.6)',
            borderColor: state.stealthMode ? 'rgba(0, 200, 50, 0.3)' : 'rgba(0, 255, 65, 0.25)',
          }}
        >
          {state.stealthMode ? '◎ STEALTH' : '◈ VISIBLE'}
        </button>

        {/* Alert level indicator — only shows when not NORMAL */}
        {state.alertLevel !== 'NORMAL' && !state.stealthMode && (
          <div style={{
            ...HUD_BTN,
            cursor: 'default',
            color: alertColor,
            borderColor: alertColor.replace('0.8', '0.5').replace('0.95', '0.5').replace('0.9', '0.5'),
            animation: state.alertLevel === 'CRITICAL' ? 'pulse 0.8s ease-in-out infinite alternate' : 'none',
          }}>
            {state.alertLevel === 'ALERT' ? '⚠ ALERT' : '🔴 CRITICAL'}
          </div>
        )}
      </div>

      {/* ── Bottom-right: widget toggles ───────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 40, right: 20,
        display: 'flex', flexDirection: 'column', gap: 8, zIndex: 50,
      }}>
        {(['sprint', 'issues'] as const).map(id => {
          const active = state.activeWidgets.has(id)
          return (
            <button
              key={id}
              onClick={() => dispatch({ type: active ? 'HIDE_WIDGET' : 'SHOW_WIDGET', id })}
              style={{
                ...HUD_BTN,
                background:  active ? 'rgba(0, 255, 65, 0.12)' : 'rgba(0, 20, 0, 0.75)',
                borderColor: active ? 'rgba(0, 255, 65, 0.75)'  : 'rgba(0, 255, 65, 0.22)',
                color:       active ? '#00ff41'                  : 'rgba(0, 255, 65, 0.42)',
                textShadow:  active ? '0 0 8px #00ff41'         : 'none',
              }}
            >
              {id.toUpperCase()}
            </button>
          )
        })}

        {/* Alert level quick-reset */}
        {state.alertLevel === 'CRITICAL' && (
          <button
            onClick={() => dispatch({ type: 'SET_ALERT_LEVEL', level: 'NORMAL' })}
            style={{ ...HUD_BTN, color: 'rgba(255,50,50,0.8)', borderColor: 'rgba(255,50,50,0.4)' }}
          >
            ✕ RESET ALERT
          </button>
        )}
      </div>

      {/* ── CSS for critical pulse animation ───────────────────────── */}
      <style>{`
        @keyframes pulse {
          from { opacity: 1; }
          to   { opacity: 0.4; }
        }
      `}</style>

      <ConfigDrawer />
    </HUDContext.Provider>
  )
}
