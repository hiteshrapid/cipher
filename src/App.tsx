// CIPHER — App
// Thin root: provides HUD context, mounts canvas + settings button + drawer

import { useReducer, useRef } from 'react'
import { HUDContext, hudReducer, initialHUDState } from './store/hudStore'
import { HUDCanvas } from './canvas/HUDCanvas'
import { ConfigDrawer } from './components/ConfigDrawer'
import type { HUDState } from './types'

export default function App() {
  const [state, dispatch] = useReducer(hudReducer, initialHUDState)

  // Keep a stable ref to state for use in the render loop
  const stateRef = useRef<HUDState>(state)
  stateRef.current = state

  return (
    <HUDContext.Provider value={{ state, dispatch }}>
      {/* Full-screen HUD canvas */}
      <HUDCanvas />

      {/* Settings toggle — top-left, always accessible */}
      <button
        onClick={() => dispatch({ type: 'TOGGLE_CONFIG' })}
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          background: 'rgba(0, 20, 0, 0.7)',
          border: '1px solid rgba(0, 255, 65, 0.35)',
          color: 'rgba(0, 255, 65, 0.8)',
          fontFamily: "'Courier New', monospace",
          fontSize: 11,
          padding: '5px 12px',
          cursor: 'pointer',
          borderRadius: 2,
          letterSpacing: '1px',
          zIndex: 50,
          backdropFilter: 'blur(4px)',
        }}
      >
        ⚙ CIPHER
      </button>

      {/* Widget quick-toggle buttons */}
      <div style={{
        position: 'fixed',
        bottom: 40,
        right: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 50,
      }}>
        {(['sprint', 'issues'] as const).map(id => {
          const active = state.activeWidgets.has(id)
          return (
            <button
              key={id}
              onClick={() => dispatch({ type: active ? 'HIDE_WIDGET' : 'SHOW_WIDGET', id })}
              style={{
                background: active ? 'rgba(0, 255, 65, 0.12)' : 'rgba(0, 20, 0, 0.7)',
                border: `1px solid ${active ? 'rgba(0, 255, 65, 0.8)' : 'rgba(0, 255, 65, 0.25)'}`,
                color: active ? '#00ff41' : 'rgba(0, 255, 65, 0.45)',
                fontFamily: "'Courier New', monospace",
                fontSize: 10,
                padding: '5px 14px',
                cursor: 'pointer',
                borderRadius: 2,
                letterSpacing: '1px',
                textShadow: active ? '0 0 8px #00ff41' : 'none',
                backdropFilter: 'blur(4px)',
              }}
            >
              {id.toUpperCase()}
            </button>
          )
        })}
      </div>

      {/* Settings drawer */}
      <ConfigDrawer />
    </HUDContext.Provider>
  )
}
