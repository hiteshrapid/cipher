// CIPHER — HUDCanvas
// Full-screen canvas: webcam + Matrix rain + HUD chrome + widgets
// canvas.captureStream(30) → OBS Browser Source → Virtual Camera

import { useEffect, useRef, useCallback } from 'react'
import { useCameraCapture } from '../hooks/useCameraCapture'
import { drawHUDChrome, drawCommandFeedback } from './layers/RingLayer'
import type { AlertLevel } from './layers/RingLayer'
import { drawWidgets, drawGestureFeedback } from './layers/WidgetLayer'
import { MatrixRainLayer } from './layers/MatrixRainLayer'
import { useHUD } from '../store/hudStore'
import type { WidgetId, ConnectorData } from '../types'
import { VoiceEngine } from '../engines/VoiceEngine'
import { GestureEngine } from '../engines/GestureEngine'
import { audioEngine } from '../engines/AudioEngine'
import { registry } from '../connectors/ConnectorRegistry'
import { JiraConnector } from '../connectors/JiraConnector'
import { GitHubConnector } from '../connectors/GitHubConnector'
import { CalendarConnector } from '../connectors/CalendarConnector'

// Canvas output dimensions — standard webcam & OBS default
const W = 1280
const H = 720

// Normalize Uint8Array (0–255 byte frequency) → number[] (0–1) for waveform ring
function normalizeWaveform(data: Uint8Array | null): number[] | null {
  if (!data || data.length === 0) return null
  return Array.from(data, v => v / 255)
}

export function HUDCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const { videoRef, ready, error } = useCameraCapture()
  const { state, dispatch } = useHUD()

  const voiceRef   = useRef<VoiceEngine | null>(null)
  const gestureRef = useRef<GestureEngine | null>(null)
  const matrixRef  = useRef<MatrixRainLayer | null>(null)
  const rafRef     = useRef<number>(0)
  const bootedRef  = useRef(false)

  // Widget birth times for entrance animation
  const birthTimes = useRef<Map<WidgetId, number>>(new Map())

  // Refs read in render loop (avoids stale closure)
  const connectorDataRef = useRef<Record<string, ConnectorData>>({})
  const activeWidgetsRef = useRef<Set<WidgetId>>(new Set())
  const lastCommandRef   = useRef<{ text: string; timestamp: number } | null>(null)
  const lastGestureRef   = useRef<{ type: string; timestamp: number } | null>(null)
  const alertLevelRef    = useRef<AlertLevel>('NORMAL')
  const stealthModeRef   = useRef(false)

  // Sync all refs from state on every render
  useEffect(() => {
    state.activeWidgets.forEach(id => {
      if (!birthTimes.current.has(id)) birthTimes.current.set(id, Date.now())
    })
    birthTimes.current.forEach((_, id) => {
      if (!state.activeWidgets.has(id)) birthTimes.current.delete(id)
    })

    connectorDataRef.current = state.connectorData
    activeWidgetsRef.current = state.activeWidgets
    lastCommandRef.current   = state.lastCommand
    lastGestureRef.current   = state.lastGesture
    alertLevelRef.current    = state.alertLevel as AlertLevel
    stealthModeRef.current   = state.stealthMode

    matrixRef.current?.setAlertLevel(state.alertLevel as AlertLevel)
    gestureRef.current?.updateActiveWidgets(state.activeWidgets)
  })

  // ─── Command side-effects (stealth, speak summary, sounds) ───────────────────
  const prevCommandRef = useRef<string | null>(null)
  useEffect(() => {
    const cmd = state.lastCommand
    if (!cmd || cmd.text === prevCommandRef.current) return
    prevCommandRef.current = cmd.text

    const t = cmd.text.toLowerCase()

    // Stealth toggle via rock-on gesture or voice
    if (t.includes('stealth')) {
      dispatch({ type: 'TOGGLE_STEALTH' })
      audioEngine.playSound(state.stealthMode ? 'summon' : 'dismiss')
      return
    }

    // Speak sprint summary
    if (t.includes('speaking summary')) {
      const jira = connectorDataRef.current['jira']
      if (jira?.status === 'connected') {
        const sprint = (jira.data as { sprint?: { sprintName: string; openCount: number; doneCount: number } }).sprint
        if (sprint) {
          audioEngine.speak(
            `${sprint.sprintName}. ${sprint.openCount} issues open, ${sprint.doneCount} done.`,
            'high'
          )
        } else {
          audioEngine.speak('No active sprint data available.', 'high')
        }
      } else {
        audioEngine.speak('Jira not connected.', 'high')
      }
      return
    }

    // Audio cues for widget show/hide
    if (t.startsWith('show') || t.includes('sprint') || t.includes('issues') || t.includes('✌') || t.includes('👍')) {
      audioEngine.playSound('summon')
    } else if (t.includes('hide') || t.includes('clear') || t.includes('✊') || t.includes('👎')) {
      audioEngine.playSound('dismiss')
    } else if (t.includes('refresh') || t.includes('↺')) {
      audioEngine.playSound('refresh')
    } else if (t.includes('confirmed')) {
      audioEngine.playSound('confirm')
    } else if (t.includes('online') || t.includes('awaiting command')) {
      audioEngine.playSound('boot')
    }
  }, [state.lastCommand, state.stealthMode, dispatch])

  // ─── Alert level from connector data ─────────────────────────────────────────
  useEffect(() => {
    if (state.stealthMode) return  // don't override stealth

    let highest: AlertLevel = 'NORMAL'
    for (const c of Object.values(state.connectorData)) {
      const al = (c.data as { alertLevel?: string }).alertLevel
      if (al === 'CRITICAL') { highest = 'CRITICAL'; break }
      else if (al === 'ALERT') highest = 'ALERT'
    }

    if (highest !== state.alertLevel) {
      if (highest === 'CRITICAL') audioEngine.playSound('alert')
      dispatch({ type: 'SET_ALERT_LEVEL', level: highest })
    }
  }, [state.connectorData, state.stealthMode, state.alertLevel, dispatch])

  // ─── Connector registry ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = registry.subscribe(data => {
      dispatch({ type: 'UPDATE_CONNECTOR', id: data.id, data })
    })

    // Jira
    if (import.meta.env.VITE_JIRA_URL) {
      const jira = new JiraConnector()
      jira.configure({ boardId: import.meta.env.VITE_JIRA_BOARD_ID ?? '1' })
      registry.register(jira, 60_000)
      dispatch({ type: 'SET_CONFIG', config: { jiraConfigured: true } })
    }

    // GitHub
    if (import.meta.env.VITE_GITHUB_TOKEN) {
      const gh = new GitHubConnector()
      gh.configure({ repos: import.meta.env.VITE_GITHUB_REPOS ?? '' })
      registry.register(gh, 90_000)
    }

    // Calendar
    if (import.meta.env.VITE_GCAL_TOKEN) {
      const cal = new CalendarConnector()
      cal.configure({
        mode:       'google',
        googleToken: import.meta.env.VITE_GCAL_TOKEN,
        calendarId:  import.meta.env.VITE_GCAL_CALENDAR_ID ?? 'primary',
      })
      registry.register(cal, 30_000)
    }

    return () => { unsub(); registry.destroy() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Engine init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    // Audio
    audioEngine.init()
    audioEngine.startMicAnalyser().catch(() => { /* mic optional */ })

    // Boot sound after a short delay (feels more cinematic)
    setTimeout(() => {
      if (!bootedRef.current) {
        bootedRef.current = true
        audioEngine.playSound('boot')
        audioEngine.speak('CIPHER online. Systems nominal.', 'high')
      }
    }, 1200)

    // Matrix rain
    const rain = new MatrixRainLayer()
    rain.resize(W, H)
    matrixRef.current = rain

    // Voice
    const voice = new VoiceEngine()
    voice.init(dispatch)
    if (state.config.voiceEnabled) voice.start()
    voiceRef.current = voice

    // Gesture
    const gesture = new GestureEngine()
    gestureRef.current = gesture

    return () => {
      voice.destroy()
      gesture.destroy()
      audioEngine.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start gesture engine once camera is ready
  useEffect(() => {
    if (!ready || !videoRef.current || !state.config.gestureEnabled) return
    gestureRef.current?.init(videoRef.current, dispatch).then(ok => {
      if (ok) gestureRef.current?.start()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // ─── Render loop ─────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const video  = videoRef.current
    if (!canvas) { rafRef.current = requestAnimationFrame(render); return }

    const ctx = canvas.getContext('2d')
    if (!ctx) { rafRef.current = requestAnimationFrame(render); return }

    const t   = performance.now()
    const now = Date.now()
    const alertLevel = alertLevelRef.current

    // ① Black base
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    // ② Matrix rain (behind video)
    matrixRef.current?.draw(ctx, t)

    // ③ Webcam frame (blended over rain)
    if (video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, W, H)
    }

    // ④ Vignette for HUD readability
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.48)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // ⑤ HUD chrome (rings + stealth/alert theming + waveform)
    const connStatuses = Object.values(connectorDataRef.current).map(c => ({
      label: c.label, status: c.status,
    }))
    const waveformRaw  = audioEngine.getWaveformData()
    const waveformNorm = normalizeWaveform(waveformRaw)

    drawHUDChrome(ctx, W, H, t, connStatuses, alertLevel, waveformNorm ?? undefined)

    // ⑥ Widgets (skipped in stealth mode)
    if (!stealthModeRef.current) {
      drawWidgets(ctx, activeWidgetsRef.current, connectorDataRef.current, birthTimes.current, now)
    }

    // ⑦ Command feedback
    const cmd = lastCommandRef.current
    if (cmd) drawCommandFeedback(ctx, W, H, cmd.text, now - cmd.timestamp)

    // ⑧ Gesture feedback
    const gest = lastGestureRef.current
    if (gest) drawGestureFeedback(ctx, W, H, gest.type.replace(/_/g, ' '), now - gest.timestamp)

    rafRef.current = requestAnimationFrame(render)
  }, [videoRef])

  // Start render loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  // ─── Error fallback ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{
        width: '100vw', height: '100vh', background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#00ff41', fontFamily: 'Courier New, monospace',
      }}>
        <div style={{ fontSize: 24, marginBottom: 16 }}>CIPHER</div>
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>CAMERA ACCESS REQUIRED</div>
        <div style={{ fontSize: 11, opacity: 0.4, maxWidth: 320, textAlign: 'center' }}>{error}</div>
        <div style={{ fontSize: 10, opacity: 0.3, marginTop: 24 }}>Check browser permissions and reload</div>
      </div>
    )
  }

  return (
    <>
      <video
        ref={videoRef}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
        playsInline
        muted
      />
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: '100vw', height: '100vh', objectFit: 'contain', display: 'block', background: '#000' }}
      />
    </>
  )
}
