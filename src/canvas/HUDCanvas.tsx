// CIPHER — HUDCanvas
// Full-screen canvas: webcam + Matrix rain + HUD chrome + widgets
// canvas.captureStream(30) → OBS Browser Source → Virtual Camera

import { useEffect, useRef, useCallback } from 'react'
import { useCameraCapture } from '../hooks/useCameraCapture'
import { drawHUDChrome, drawCommandFeedback } from './layers/RingLayer'
import type { AlertLevel } from './layers/RingLayer'
import { drawWidgets, drawGestureFeedback, drawFaceScanRing, drawIntelCard, consumeDwellSelection, resetDwell } from './layers/WidgetLayer'
import { drawHandSkeleton } from './layers/HandLayer'
import { MatrixRainLayer } from './layers/MatrixRainLayer'
import { useHUD } from '../store/hudStore'
import type { WidgetId, ConnectorData, SearchResult, NotificationItem, ActivityItem, DrillDownState, SlackData, GmailData } from '../types'
import { GestureEngine } from '../engines/GestureEngine'
import { audioEngine } from '../engines/AudioEngine'
import { interactiveMode } from '../engines/InteractiveMode'
import { smartSearch } from '../connectors/SearchEngine'
import { registry } from '../connectors/ConnectorRegistry'
import { GitHubConnector } from '../connectors/GitHubConnector'
import { CalendarConnector } from '../connectors/CalendarConnector'
import { SlackConnector } from '../connectors/SlackConnector'
import { GmailConnector } from '../connectors/GmailConnector'
import { LinearConnector } from '../connectors/LinearConnector'
import { pushState, startPolling } from '../sync/StateSync'

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

  // OBS overlay mode: ?overlay=true → transparent canvas, no webcam draw
  const overlayMode = useRef(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('overlay')
  )

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
  const searchQueryRef      = useRef<string | null>(null)
  const searchResultRef     = useRef<SearchResult | null>(null)
  const searchLoadingRef    = useRef(false)
  const intelCardShownAtRef = useRef<number | null>(null)
  const notificationsRef       = useRef<NotificationItem[]>([])
  const activityFeedRef        = useRef<ActivityItem[]>([])
  const focusedWidgetRef       = useRef<WidgetId | null>(null)
  const drillDownRef           = useRef<DrillDownState | null>(null)
  const bootTimeRef            = useRef<number>(Date.now())
  const transcriptPanelRef     = useRef(state.transcriptPanel)
  const transcriptPanelBornAt  = useRef<number | null>(null)

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
    searchQueryRef.current   = state.searchQuery
    searchResultRef.current  = state.searchResult
    searchLoadingRef.current = state.searchLoading
    notificationsRef.current = state.notifications ?? []
    activityFeedRef.current  = state.activityFeed ?? []
    focusedWidgetRef.current = state.focusedWidget
    drillDownRef.current     = state.drillDown
    // Sync focused widget to GestureEngine for gesture freezing
    if (gestureRef.current) {
      gestureRef.current.updateFocusedWidget(state.focusedWidget)
    }

    // Track transcript panel birth for entrance animation
    if (state.transcriptPanel.active && !transcriptPanelBornAt.current) {
      transcriptPanelBornAt.current = Date.now()
    } else if (!state.transcriptPanel.active) {
      transcriptPanelBornAt.current = null
    }
    transcriptPanelRef.current = {
      ...state.transcriptPanel,
      bornAt: transcriptPanelBornAt.current ?? undefined,
    } as typeof state.transcriptPanel & { bornAt?: number }

    matrixRef.current?.setAlertLevel(state.alertLevel as AlertLevel)
    gestureRef.current?.updateActiveWidgets(state.activeWidgets)

    // Sync state to OBS overlay (controller mode — non-overlay tab pushes state)
    if (!overlayMode.current) {
      pushState(state)
    }
  })

  // ─── Command side-effects (stealth, speak summary, sounds) ───────────────────
  const prevCommandRef = useRef<string | null>(null)
  useEffect(() => {
    const cmd = state.lastCommand
    if (!cmd || cmd.text === prevCommandRef.current) return
    prevCommandRef.current = cmd.text

    const t = cmd.text.toLowerCase()

    // Speak sprint summary
    if (t.includes('speaking summary')) {
      const linear = connectorDataRef.current['linear']
      if (linear?.status === 'connected') {
        const data = linear.data as { assignedTickets?: unknown[]; projectName?: string }
        if (data?.assignedTickets) {
          audioEngine.speak(
            `${data.projectName ?? 'Linear'}. ${data.assignedTickets.length} tickets assigned.`,
            'high'
          )
        } else {
          audioEngine.speak('No Linear data available.', 'high')
        }
      } else {
        audioEngine.speak('Linear not connected.', 'high')
      }
      return
    }

  }, [state.lastCommand, dispatch])

  // ─── Dwell-to-select: poll in render loop via ref-based callback ────────────
  const dwellCheckRef = useRef<() => void>(() => {})
  useEffect(() => {
    dwellCheckRef.current = () => {
      if (!state.focusedWidget) return
      const idx = consumeDwellSelection()
      if (idx === -1) return

      // Back button sentinel
      if (idx === -99) {
        if (state.drillDown) {
          dispatch({ type: 'DRILL_BACK' })
          resetDwell()
        }
        return
      }

      // Already drilled down — ignore item dwell
      if (state.drillDown) return

      if (state.focusedWidget === 'notifications') {
        const notif = state.notifications[idx]
        if (notif) {
          dispatch({ type: 'DRILL_DOWN', state: {
            type: 'notification', itemIndex: idx,
            title: notif.text, body: notif.detail ?? notif.text,
            source: notif.source, timestamp: notif.timestamp,
          }})
          resetDwell()
        }
      } else if (state.focusedWidget === 'activity') {
        const act = state.activityFeed[idx]
        if (act) {
          dispatch({ type: 'DRILL_DOWN', state: {
            type: 'activity', itemIndex: idx,
            title: act.text, body: act.detail ?? act.text,
            source: act.source, timestamp: act.timestamp,
          }})
          resetDwell()
        }
      } else if (state.focusedWidget === 'sprint') {
        const statusMap = ['progress', 'todo', 'review', 'done']
        const statusLabels = ['In Progress', 'Todo', 'In Review', 'Done']
        if (idx >= 0 && idx < statusMap.length) {
          dispatch({ type: 'DRILL_DOWN', state: {
            type: 'linear_status', statusFilter: statusMap[idx],
            title: statusLabels[idx], body: '',
            source: 'linear', timestamp: Date.now(),
          }})
          resetDwell()
        }
      }
    }
  }, [state.focusedWidget, state.drillDown, state.notifications, state.activityFeed, dispatch])

  // ─── Smart search (OpenAI → DuckDuckGo → Wikipedia) ──────────────────────────
  useEffect(() => {
    const query = state.searchQuery
    if (!query) return

    let cancelled = false

    smartSearch(query)
      .then(result => {
        if (cancelled) return
        dispatch({ type: 'SET_SEARCH_RESULT', result })
        audioEngine.speak(`Found: ${result.title}.`, 'high')
      })
      .catch(() => {
        if (cancelled) return
        dispatch({
          type: 'SET_SEARCH_RESULT',
          result: {
            query,
            title: query,
            abstract: `No result for "${query}". Try a different query.`,
            source: '',
          },
        })
      })

    return () => { cancelled = true }
  }, [state.searchQuery, dispatch])

  // ─── Intel Card lifetime tracking + auto-dismiss ──────────────────────────────
  useEffect(() => {
    if (state.searchResult) {
      intelCardShownAtRef.current = Date.now()
      const timer = setTimeout(() => {
        dispatch({ type: 'HIDE_WIDGET', id: 'search' })
        intelCardShownAtRef.current = null
      }, 7000)
      return () => clearTimeout(timer)
    } else {
      intelCardShownAtRef.current = null
    }
  }, [state.searchResult, dispatch])

  // ─── Alert level from connector data ─────────────────────────────────────────
  useEffect(() => {
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
  }, [state.connectorData, state.alertLevel, dispatch])

  // ─── Derive rich notifications from Slack/Gmail connector data ────────────────
  const seenSlackKeys = useRef<Set<string>>(new Set())
  const seenGmailKeys = useRef<Set<string>>(new Set())

  useEffect(() => {
    const slackData = state.connectorData['slack']?.data as unknown as SlackData | undefined
    const gmailData = state.connectorData['gmail']?.data as unknown as GmailData | undefined

    // Slack mentions → notifications only
    if (slackData?.mentions) {
      for (const msg of slackData.mentions) {
        const key = `${msg.channel}-${msg.timestamp}`
        if (seenSlackKeys.current.has(key)) continue
        seenSlackKeys.current.add(key)
        dispatch({
          type: 'ADD_NOTIFICATION',
          item: {
            source: 'slack',
            text: `@${msg.author} in ${msg.channel}: ${msg.text}`,
            detail: msg.text,
            timestamp: new Date(msg.timestamp).getTime(),
            priority: 'normal',
          },
        })
      }
    }

    // Slack DMs → high priority notifications
    if (slackData?.recentDMs) {
      for (const dm of slackData.recentDMs) {
        const key = `dm-${dm.author}-${dm.timestamp}`
        if (seenSlackKeys.current.has(key)) continue
        seenSlackKeys.current.add(key)
        dispatch({
          type: 'ADD_NOTIFICATION',
          item: {
            source: 'slack',
            text: `DM from ${dm.author}: ${dm.text}`,
            detail: dm.text,
            timestamp: new Date(dm.timestamp).getTime(),
            priority: 'high',
          },
        })
      }
    }

    // Gmail → activity feed only
    if (gmailData?.recentThreads) {
      for (const thread of gmailData.recentThreads) {
        if (seenGmailKeys.current.has(thread.id)) continue
        seenGmailKeys.current.add(thread.id)
        dispatch({
          type: 'ADD_ACTIVITY',
          item: { source: 'gmail', text: `${thread.from} \u2014 ${thread.subject}`, detail: thread.snippet ?? '', timestamp: new Date(thread.timestamp).getTime(), icon: '\u{1F4E7}' },
        })
      }
    }
  }, [state.connectorData, dispatch])

  // ─── Connector registry ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = registry.subscribe(data => {
      dispatch({ type: 'UPDATE_CONNECTOR', id: data.id, data })
    })

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
      dispatch({ type: 'SET_CONFIG', config: { calendarConfigured: true } })
    }

    // Slack
    if (import.meta.env.VITE_SLACK_BOT_TOKEN) {
      const slack = new SlackConnector()
      slack.configure({})
      registry.register(slack, 30_000)
      dispatch({ type: 'SET_CONFIG', config: { slackConfigured: true } })
    }

    // Gmail
    if (import.meta.env.VITE_GMAIL_TOKEN) {
      const gmail = new GmailConnector()
      gmail.configure({})
      registry.register(gmail, 60_000)
      dispatch({ type: 'SET_CONFIG', config: { gmailConfigured: true } })
    }

    // Linear
    if (import.meta.env.VITE_LINEAR_TOKEN) {
      const linear = new LinearConnector()
      linear.configure({})
      registry.register(linear, 60_000)
      dispatch({ type: 'SET_CONFIG', config: { linearConfigured: true } })
    }

    // Auto-show default widgets (issues hidden until finger 1)
    dispatch({ type: 'SHOW_WIDGET', id: 'sprint' })
    dispatch({ type: 'SHOW_WIDGET', id: 'github' })
    dispatch({ type: 'SHOW_WIDGET', id: 'calendar' })
    dispatch({ type: 'SHOW_WIDGET', id: 'notifications' })
    dispatch({ type: 'SHOW_WIDGET', id: 'activity' })

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
        // TTS disabled — was annoying on every reload
      }
    }, 1200)

    // Matrix rain
    const rain = new MatrixRainLayer()
    rain.resize(W, H)
    matrixRef.current = rain

    // Interactive mode (Deepgram STT + Cartesia TTS — activated by rock-on gesture)
    interactiveMode.init(dispatch)

    // Gesture
    const gesture = new GestureEngine()
    gesture.setCanvasSize(W, H)
    gestureRef.current = gesture

    return () => {
      gesture.destroy()
      interactiveMode.destroy()
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

  // Transcript panel active → start/stop InteractiveMode
  useEffect(() => {
    if (state.transcriptPanel.active) {
      interactiveMode.activate()
    } else {
      interactiveMode.deactivate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.transcriptPanel.active])

  // ─── Overlay mode: poll state from controller tab ───────────────────────────
  useEffect(() => {
    if (!overlayMode.current) return
    const stop = startPolling((sync) => {
      // Use refs (not state) to avoid stale closure — refs are always current
      const currentWidgets = activeWidgetsRef.current
      const syncIds = new Set(sync.activeWidgets)

      // Reconcile widget visibility
      currentWidgets.forEach(id => {
        if (!syncIds.has(id)) dispatch({ type: 'HIDE_WIDGET', id })
      })
      syncIds.forEach(id => {
        if (!currentWidgets.has(id as WidgetId)) dispatch({ type: 'SHOW_WIDGET', id: id as WidgetId })
      })

      // Sync alert level
      if (sync.alertLevel !== alertLevelRef.current) {
        dispatch({ type: 'SET_ALERT_LEVEL', level: sync.alertLevel as AlertLevel })
      }

      // Sync search
      if (sync.searchQuery && sync.searchQuery !== searchQueryRef.current) {
        dispatch({ type: 'SEARCH_QUERY', query: sync.searchQuery })
      }

      // Sync command feedback
      if (sync.lastCommand && sync.lastCommand !== lastCommandRef.current?.text) {
        dispatch({ type: 'COMMAND_RECEIVED', text: sync.lastCommand })
      }
    })
    return stop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    // ① Base — transparent in overlay mode, black otherwise
    if (overlayMode.current) {
      ctx.clearRect(0, 0, W, H)
    } else {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
    }

    // ② Matrix rain (behind video; still drawn in overlay for ambience)
    matrixRef.current?.draw(ctx, t)

    // ③ Webcam frame (skipped in overlay — OBS composites the real camera underneath)
    if (!overlayMode.current && video && video.readyState >= 2) {
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(video, -W, 0, W, H)
      ctx.restore()
    }

    // ③.5 Hand skeleton overlay (neon finger web, on top of video)
    const handLandmarks = gestureRef.current?.getHandLandmarks()
    if (handLandmarks) {
      // Mirror landmarks to match flipped video
      const mirrored = handLandmarks.map(lm => ({ ...lm, x: 1 - lm.x }))
      drawHandSkeleton(ctx, mirrored, W, H, lastGestureRef.current, t)
    }

    // ④ Vignette for HUD readability (skipped in overlay — OBS handles compositing)
    if (!overlayMode.current) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0.48)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, W, H)
    }

    // ⑤ HUD chrome (rings + stealth/alert theming + waveform)
    const connStatuses = Object.values(connectorDataRef.current).map(c => ({
      label: c.label, status: c.status,
    }))
    const waveformRaw  = audioEngine.getWaveformData()
    const waveformNorm = normalizeWaveform(waveformRaw)

    drawHUDChrome(ctx, W, H, t, connStatuses, alertLevel, waveformNorm ?? undefined, 'inactive')

    // ⑥ Widgets
    {
      // Get fingertip position for hover highlighting in focus mode
      const fingerTip = gestureRef.current?.getIndexTipPosition() ?? null
      drawWidgets(ctx, activeWidgetsRef.current, connectorDataRef.current, birthTimes.current, now, notificationsRef.current, activityFeedRef.current, bootTimeRef.current, transcriptPanelRef.current as Parameters<typeof drawWidgets>[8], focusedWidgetRef.current, fingerTip, drillDownRef.current)

      // Check for dwell-to-select completion (after drawWidgets updates dwell state)
      dwellCheckRef.current()

      // Iron Man Intel Card — face-overlay popup for search results
      const isSearchActive = searchLoadingRef.current || searchResultRef.current !== null
      if (isSearchActive) {
        const cardAge = intelCardShownAtRef.current ? now - intelCardShownAtRef.current : 0
        const lockAge = searchResultRef.current && intelCardShownAtRef.current
          ? now - intelCardShownAtRef.current
          : 0
        drawFaceScanRing(ctx, t, searchLoadingRef.current, lockAge)
        drawIntelCard(ctx, W, H, searchQueryRef.current, searchResultRef.current, searchLoadingRef.current, cardAge)
      }
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

  // ─── Error fallback (suppressed in overlay mode — OBS has no camera access) ──
  if (error && !overlayMode.current) {
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
        style={{ width: '100vw', height: '100vh', objectFit: 'contain', display: 'block', background: overlayMode.current ? 'transparent' : '#000' }}
      />
    </>
  )
}
