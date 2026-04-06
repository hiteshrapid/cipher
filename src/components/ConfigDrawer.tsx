// CIPHER — ConfigDrawer
// Settings panel: OBS setup instructions + connector status

import { useHUD } from '../store/hudStore'
import { registry } from '../connectors/ConnectorRegistry'
import './ConfigDrawer.css'

export function ConfigDrawer() {
  const { state, dispatch } = useHUD()

  if (!state.configOpen) return null

  const connectors = registry.getAll()

  const handleRefresh = () => {
    registry.forceRefresh()
    dispatch({ type: 'COMMAND_RECEIVED', text: '↺ manual refresh triggered' })
  }

  return (
    <div className="drawer-overlay" onClick={() => dispatch({ type: 'TOGGLE_CONFIG' })}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <span className="drawer-title">▸ CIPHER CONFIG</span>
          <button className="drawer-close" onClick={() => dispatch({ type: 'TOGGLE_CONFIG' })}>✕</button>
        </div>

        {/* OBS Setup */}
        <section className="drawer-section">
          <h3>OBS Virtual Camera Setup</h3>
          <ol className="obs-steps">
            <li>Open OBS → Sources → <kbd>+</kbd> → Browser Source</li>
            <li>URL: <code>http://localhost:5173</code></li>
            <li>Width: <code>1280</code> · Height: <code>720</code></li>
            <li>Enable <strong>OBS Virtual Camera</strong></li>
            <li>In Zoom/Meet → Settings → Camera → select <strong>"OBS Virtual Camera"</strong></li>
          </ol>
        </section>

        {/* Jira Config */}
        <section className="drawer-section">
          <h3>Jira Connector</h3>
          {state.config.jiraConfigured ? (
            <div className="config-status connected">◉ Connected</div>
          ) : (
            <div className="config-instructions">
              <p>Add to <code>.env.local</code> in the project root and restart:</p>
              <pre>{`VITE_JIRA_URL=https://yourcompany.atlassian.net
VITE_JIRA_EMAIL=you@company.com
VITE_JIRA_TOKEN=your-api-token
VITE_JIRA_BOARD_ID=1`}</pre>
              <p className="hint">Get your API token at: <code>id.atlassian.com → Security → API tokens</code></p>
            </div>
          )}
        </section>

        {/* Connector status */}
        {connectors.length > 0 && (
          <section className="drawer-section">
            <h3>Connector Status</h3>
            <div className="connector-list">
              {connectors.map(c => (
                <div key={c.id} className={`connector-row status-${c.status}`}>
                  <span className="connector-dot">{c.status === 'connected' ? '◉' : c.status === 'error' ? '✕' : '○'}</span>
                  <span className="connector-label">{c.label}</span>
                  {c.status === 'error' && (
                    <span className="connector-error">{c.errorMessage}</span>
                  )}
                  {c.lastUpdated > 0 && (
                    <span className="connector-time">
                      {new Date(c.lastUpdated).toTimeString().slice(0, 8)}
                    </span>
                  )}
                </div>
              ))}
              <button className="refresh-btn" onClick={handleRefresh}>↺ Force Refresh</button>
            </div>
          </section>
        )}

        {/* Voice + gesture toggles */}
        <section className="drawer-section">
          <h3>Controls</h3>
          <div className="toggle-row">
            <span>Voice Commands</span>
            <button
              className={`toggle-btn ${state.config.voiceEnabled ? 'on' : 'off'}`}
              onClick={() => dispatch({ type: 'SET_CONFIG', config: { voiceEnabled: !state.config.voiceEnabled } })}
            >
              {state.config.voiceEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="toggle-row">
            <span>Gesture Control</span>
            <button
              className={`toggle-btn ${state.config.gestureEnabled ? 'on' : 'off'}`}
              onClick={() => dispatch({ type: 'SET_CONFIG', config: { gestureEnabled: !state.config.gestureEnabled } })}
            >
              {state.config.gestureEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </section>

        {/* Voice command reference */}
        <section className="drawer-section">
          <h3>Voice Commands</h3>
          <table className="cmd-table">
            <tbody>
              <tr><td>"show sprint"</td><td>Show sprint status panel</td></tr>
              <tr><td>"show issues"</td><td>Show my open issues</td></tr>
              <tr><td>"hide all"</td><td>Clear all panels</td></tr>
              <tr><td>"refresh"</td><td>Force data refresh</td></tr>
            </tbody>
          </table>
        </section>

        {/* Gesture reference */}
        <section className="drawer-section">
          <h3>Gestures</h3>
          <table className="cmd-table">
            <tbody>
              <tr><td>Open palm (hold 1s)</td><td>Toggle last panel</td></tr>
              <tr><td>Pinch</td><td>Dismiss all panels</td></tr>
              <tr><td>Swipe right</td><td>Next panel</td></tr>
              <tr><td>Swipe left</td><td>Previous panel</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
