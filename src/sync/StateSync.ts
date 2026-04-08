// CIPHER — StateSync
// Syncs HUD state between Chrome tab (controller) and OBS browser source (display-only)
// Uses a shared in-memory store via Vite dev server custom endpoint
// Controller (non-overlay) POSTs state changes, overlay GETs and applies them

import type { WidgetId, AlertLevel } from '../types'

export interface SyncState {
  activeWidgets: string[]
  stealthMode: boolean
  alertLevel: string
  lastCommand: string | null
  lastGesture: string | null
  searchQuery: string | null
  timestamp: number
}

const SYNC_URL = '/api/cipher-sync'
const POLL_INTERVAL = 80 // ms — fast polling for near-instant sync

let lastPushedState = ''

// ─── Controller (Chrome tab) — pushes state ─────────────────────────────────
export function pushState(state: {
  activeWidgets: Set<WidgetId>
  stealthMode: boolean
  alertLevel: AlertLevel
  lastCommand: { text: string; timestamp: number } | null
  lastGesture: { type: string; timestamp: number } | null
  searchQuery: string | null
}) {
  const sync: SyncState = {
    activeWidgets: Array.from(state.activeWidgets),
    stealthMode: state.stealthMode,
    alertLevel: state.alertLevel,
    lastCommand: state.lastCommand?.text ?? null,
    lastGesture: state.lastGesture?.type ?? null,
    searchQuery: state.searchQuery,
    timestamp: Date.now(),
  }

  const json = JSON.stringify(sync)
  if (json === lastPushedState) return // no change
  lastPushedState = json

  fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json,
  }).catch(() => { /* sync is best-effort */ })
}

// ─── Overlay (OBS browser source) — polls state ─────────────────────────────
export function startPolling(
  onUpdate: (state: SyncState) => void,
): () => void {
  let lastTimestamp = 0
  let active = true

  async function poll() {
    if (!active) return
    try {
      const res = await fetch(SYNC_URL)
      if (res.ok) {
        const data: SyncState = await res.json()
        if (data.timestamp > lastTimestamp) {
          lastTimestamp = data.timestamp
          onUpdate(data)
        }
      }
    } catch { /* ignore */ }
    if (active) setTimeout(poll, POLL_INTERVAL)
  }

  poll()
  return () => { active = false }
}
