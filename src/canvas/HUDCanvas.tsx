// CIPHER — HUDCanvas
// Full-screen canvas: composites webcam + HUD chrome + widgets
// canvas.captureStream(30) → feed into OBS Browser Source

import { useEffect, useRef, useCallback } from 'react'
import { useCameraCapture } from '../hooks/useCameraCapture'
import { drawHUDChrome, drawCommandFeedback } from './layers/RingLayer'
import { drawWidgets, drawGestureFeedback } from './layers/WidgetLayer'
import { useHUD } from '../store/hudStore'
import type { WidgetId, ConnectorData } from '../types'
import { VoiceEngine } from '../engines/VoiceEngine'
import { GestureEngine } from '../engines/GestureEngine'
import { registry } from '../connectors/ConnectorRegistry'
import { JiraConnector } from '../connectors/JiraConnector'

// Canvas output dimensions — matches standard webcam & OBS default
const W = 1280
const H = 720

export function HUDCanvas() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const { videoRef, ready, error } = useCameraCapture()
  const { state, dispatch } = useHUD()

  // Engines (stable refs — never re-created)
  const voiceRef   = useRef<VoiceEngine | null>(null)
  const gestureRef = useRef<GestureEngine | null>(null)
  const rafRef     = useRef<number>(0)

  // Widget birth times for entrance animation
  const birthTimes = useRef<Map<WidgetId, number>>(new Map())

  // Connector data ref — read in render loop without closure staleness
  const connectorDataRef   = useRef<Record<string, ConnectorData>>({})
  const activeWidgetsRef   = useRef<Set<WidgetId>>(new Set())
  const lastCommandRef     = useRef<{ text: string; timestamp: number } | null>(null)
  const lastGestureRef     = useRef<{ type: string; timestamp: number } | null>(null)

  // Keep refs in sync with state
  useEffect(() => {
    // Track widget birth times
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

    // Keep gesture engine aware of active widgets
    gestureRef.current?.updateActiveWidgets(state.activeWidgets)
  })

  // ─── Connector registry setup ───────────────────────────────────────────────
  useEffect(() => {
    const jiraConnector = new JiraConnector()
    const boardId = import.meta.env.VITE_JIRA_BOARD_ID ?? '1'
    jiraConnector.configure({ boardId })

    const unsub = registry.subscribe(data => {
      dispatch({ type: 'UPDATE_CONNECTOR', id: data.id, data })
    })

    if (import.meta.env.VITE_JIRA_URL) {
      registry.register(jiraConnector, 60_000)
      dispatch({ type: 'SET_CONFIG', config: { jiraConfigured: true } })
    }

    return () => {
      unsub()
      registry.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Voice + Gesture engine init ────────────────────────────────────────────
  useEffect(() => {
    const voice = new VoiceEngine()
    voice.init(dispatch)
    if (state.config.voiceEnabled) voice.start()
    voiceRef.current = voice

    const gesture = new GestureEngine()
    gestureRef.current = gesture

    return () => {
      voice.destroy()
      gesture.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Start gesture engine once camera is ready
  useEffect(() => {
    if (!ready || !videoRef.current || !state.config.gestureEnabled) return
    const gesture = gestureRef.current
    if (!gesture) return

    gesture.init(videoRef.current, dispatch).then(ok => {
      if (ok) gesture.start()
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

    // ① Black background
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    // ② Webcam frame
    if (video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, W, H)
    }

    // ③ Darken overlay for HUD readability
    const grad = ctx.createRadialGradient(W/2, H/2, H * 0.2, W/2, H/2, H * 0.8)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // ④ HUD chrome: rings, brackets, scanline, status bar, clock
    const connStatuses = Object.values(connectorDataRef.current).map(c => ({
      label: c.label, status: c.status,
    }))
    drawHUDChrome(ctx, W, H, t, connStatuses)

    // ⑤ Widgets
    drawWidgets(ctx, activeWidgetsRef.current, connectorDataRef.current, birthTimes.current, now)

    // ⑥ Command feedback (bottom-center flash)
    const cmd = lastCommandRef.current
    if (cmd) {
      drawCommandFeedback(ctx, W, H, cmd.text, now - cmd.timestamp)
    }

    // ⑦ Gesture feedback (bottom-right)
    const gest = lastGestureRef.current
    if (gest) {
      const label = gest.type.replace(/_/g, ' ')
      drawGestureFeedback(ctx, W, H, label, now - gest.timestamp)
    }

    rafRef.current = requestAnimationFrame(render)
  }, [videoRef])

  // Start render loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [render])

  // ─── Error / no-camera fallback ──────────────────────────────────────────────
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
        <div style={{ fontSize: 10, opacity: 0.3, marginTop: 24 }}>
          Check browser permissions and reload
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Hidden video element plays the webcam stream */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
        playsInline
        muted
      />

      {/* HUD canvas — fills viewport */}
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          width: '100vw',
          height: '100vh',
          objectFit: 'contain',
          display: 'block',
          background: '#000',
        }}
      />
    </>
  )
}
