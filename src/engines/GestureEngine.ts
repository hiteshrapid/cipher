// CIPHER — GestureEngine
// MediaPipe Hands → gesture detection → HUD commands
// Loads model from CDN to avoid bundling the large WASM binary

import type { GestureType, HUDAction, WidgetId } from '../types'

type Dispatch = (action: HUDAction) => void

// Landmark indices per MediaPipe hand model
const WRIST = 0
const TIPS  = [4, 8, 12, 16, 20]  // thumb, index, middle, ring, pinky
const PIPS  = [2, 6, 10, 14, 18]  // corresponding PIP joints (used as extension baseline)

interface Landmark { x: number; y: number; z: number }

// ─── Gesture classifiers ──────────────────────────────────────────────────────
function isOpenPalm(lm: Landmark[]): boolean {
  // All fingers must be extended: tip.y < pip.y (screen coords, y=0 at top)
  // Thumb uses x-axis extension check (thumb tip further from wrist x than pip)
  const thumbExtended = Math.abs(lm[4].x - lm[0].x) > Math.abs(lm[2].x - lm[0].x)
  const fingersExtended = [1, 2, 3, 4].every(i => lm[TIPS[i]].y < lm[PIPS[i]].y - 0.02)
  return thumbExtended && fingersExtended
}

function isPinch(lm: Landmark[]): boolean {
  const dx = lm[4].x - lm[8].x
  const dy = lm[4].y - lm[8].y
  const dist = Math.sqrt(dx * dx + dy * dy)
  return dist < 0.06
}

// Track wrist positions for swipe detection
const wristHistory: Array<{ x: number; t: number }> = []
const SWIPE_WINDOW_MS = 600
const SWIPE_THRESHOLD = 0.20  // fraction of screen width

function detectSwipe(lm: Landmark[]): 'swipe_left' | 'swipe_right' | null {
  const now = Date.now()
  wristHistory.push({ x: lm[WRIST].x, t: now })

  // Prune old history
  const cutoff = now - SWIPE_WINDOW_MS
  while (wristHistory.length > 0 && wristHistory[0].t < cutoff) wristHistory.shift()

  if (wristHistory.length < 4) return null

  const dx = wristHistory[wristHistory.length - 1].x - wristHistory[0].x
  if (Math.abs(dx) > SWIPE_THRESHOLD) {
    wristHistory.length = 0  // reset after detecting
    return dx > 0 ? 'swipe_right' : 'swipe_left'
  }
  return null
}

// ─── Widget cycling (swipe toggles between sprint / issues) ──────────────────
const CYCLE_WIDGETS: WidgetId[] = ['sprint', 'issues']
let cycleIndex = 0

function handleGesture(gesture: GestureType, dispatch: Dispatch, activeWidgets: Set<WidgetId>) {
  dispatch({ type: 'GESTURE_DETECTED', gesture })

  switch (gesture) {
    case 'open_palm': {
      // Summon the first widget that isn't active, or dismiss all if all active
      const anyActive = CYCLE_WIDGETS.some(id => activeWidgets.has(id))
      if (!anyActive) {
        dispatch({ type: 'SHOW_WIDGET', id: 'sprint' })
      } else {
        dispatch({ type: 'HIDE_ALL' })
      }
      break
    }
    case 'pinch':
      dispatch({ type: 'HIDE_ALL' })
      break
    case 'swipe_right': {
      cycleIndex = (cycleIndex + 1) % CYCLE_WIDGETS.length
      const next = CYCLE_WIDGETS[cycleIndex]
      dispatch({ type: 'SHOW_WIDGET', id: next })
      break
    }
    case 'swipe_left': {
      cycleIndex = (cycleIndex - 1 + CYCLE_WIDGETS.length) % CYCLE_WIDGETS.length
      const prev = CYCLE_WIDGETS[cycleIndex]
      dispatch({ type: 'SHOW_WIDGET', id: prev })
      break
    }
  }
}

// ─── GestureEngine class ──────────────────────────────────────────────────────
export class GestureEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private landmarker: any = null
  private dispatch: Dispatch | null = null
  private videoEl: HTMLVideoElement | null = null
  private rafId: number | null = null
  private lastGestureTime = 0
  private lastGesture: GestureType | null = null
  private COOLDOWN_MS = 800
  private activeWidgets: Set<WidgetId> = new Set()

  async init(videoEl: HTMLVideoElement, dispatch: Dispatch): Promise<boolean> {
    this.videoEl  = videoEl
    this.dispatch = dispatch

    try {
      // Dynamic import to avoid loading WASM at startup
      const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      )

      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU',
        },
        numHands:    1,
        runningMode: 'VIDEO',
      })

      console.log('CIPHER: GestureEngine ready')
      return true
    } catch (err) {
      console.warn('CIPHER: GestureEngine failed to initialise:', err)
      return false
    }
  }

  updateActiveWidgets(widgets: Set<WidgetId>) {
    this.activeWidgets = widgets
  }

  start() {
    if (!this.landmarker || !this.videoEl) return
    this.loop()
  }

  stop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop)

    if (!this.videoEl || !this.landmarker || this.videoEl.readyState < 2) return

    // Only run inference at ~10fps to save CPU
    const now = performance.now()
    if (now - this.lastDetectTime < 100) return
    this.lastDetectTime = now

    try {
      const results = this.landmarker.detectForVideo(this.videoEl, now)
      if (!results.landmarks || results.landmarks.length === 0) {
        wristHistory.length = 0  // reset swipe on hand loss
        return
      }

      const lm: Landmark[] = results.landmarks[0]
      this.classifyAndDispatch(lm)
    } catch { /* ignore frame errors */ }
  }

  private lastDetectTime = 0

  private classifyAndDispatch(lm: Landmark[]) {
    if (!this.dispatch) return
    const now = Date.now()
    if (now - this.lastGestureTime < this.COOLDOWN_MS) return

    let detected: GestureType | null = null

    const swipe = detectSwipe(lm)
    if (swipe) {
      detected = swipe
    } else if (isPinch(lm)) {
      detected = 'pinch'
    } else if (isOpenPalm(lm)) {
      detected = 'open_palm'
    }

    if (detected && detected !== this.lastGesture) {
      this.lastGestureTime = now
      this.lastGesture = detected
      handleGesture(detected, this.dispatch, this.activeWidgets)
    } else if (!detected) {
      this.lastGesture = null
    }
  }

  destroy() {
    this.stop()
    this.landmarker?.close?.()
    this.landmarker = null
    this.dispatch   = null
    this.videoEl    = null
  }
}
