// CIPHER — GestureEngine
// MediaPipe Hands → gesture detection → HUD commands
// Loads model from CDN to avoid bundling the large WASM binary

import type { GestureType, HUDAction, WidgetId } from '../types'

type Dispatch = (action: HUDAction) => void

// Extended gesture type — superset of GestureType for internal classification.
// New gestures are not added to the public GestureType union (types/index.ts stays
// untouched). They dispatch via COMMAND_RECEIVED instead of GESTURE_DETECTED.
type ExtendedGestureType =
  | GestureType
  | 'thumbs_up'
  | 'thumbs_down'
  | 'peace_sign'
  | 'point_up'
  | 'fist'
  | 'rock_on'
  | 'call_me'

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

// ─── New classifiers ──────────────────────────────────────────────────────────

// Thumbs up: thumb tip well above IP joint, all 4 fingers curled
function isThumbsUp(lm: Landmark[]): boolean {
  const thumbUp = lm[4].y < lm[2].y - 0.08
  const fingersCurled =
    lm[8].y  > lm[6].y  &&
    lm[12].y > lm[10].y &&
    lm[16].y > lm[14].y &&
    lm[20].y > lm[18].y
  return thumbUp && fingersCurled
}

// Thumbs down: thumb tip well below IP joint, all 4 fingers curled
function isThumbsDown(lm: Landmark[]): boolean {
  const thumbDown = lm[4].y > lm[2].y + 0.08
  const fingersCurled =
    lm[8].y  > lm[6].y  &&
    lm[12].y > lm[10].y &&
    lm[16].y > lm[14].y &&
    lm[20].y > lm[18].y
  return thumbDown && fingersCurled
}

// Peace / V-sign: index + middle extended, ring + pinky curled
function isPeaceSign(lm: Landmark[]): boolean {
  return (
    lm[8].y  < lm[6].y  - 0.04 &&
    lm[12].y < lm[10].y - 0.04 &&
    lm[16].y > lm[14].y        &&
    lm[20].y > lm[18].y
  )
}

// Point up: index extended only, other fingers curled
function isPointUp(lm: Landmark[]): boolean {
  return (
    lm[8].y  < lm[6].y  - 0.05 &&
    lm[12].y > lm[10].y        &&
    lm[16].y > lm[14].y        &&
    lm[20].y > lm[18].y
  )
}

// Fist: all fingertips below MCP joints, thumb tucked toward index MCP
function isFist(lm: Landmark[]): boolean {
  const fingersCurled =
    lm[8].y  > lm[5].y  &&
    lm[12].y > lm[9].y  &&
    lm[16].y > lm[13].y &&
    lm[20].y > lm[17].y
  const thumbTucked = Math.abs(lm[4].x - lm[5].x) < 0.08
  return fingersCurled && thumbTucked
}

// Rock on (🤘): index + pinky extended, middle + ring curled
function isRockOn(lm: Landmark[]): boolean {
  return (
    lm[8].y  < lm[6].y  - 0.04 &&
    lm[20].y < lm[18].y - 0.04 &&
    lm[12].y > lm[10].y        &&
    lm[16].y > lm[14].y
  )
}

// Call me (🤙): thumb + pinky extended, index + middle + ring curled
function isCallMe(lm: Landmark[]): boolean {
  const thumbExtended = Math.abs(lm[4].x - lm[2].x) > 0.08
  return (
    thumbExtended              &&
    lm[20].y < lm[18].y - 0.04 &&
    lm[8].y  > lm[6].y         &&
    lm[12].y > lm[10].y        &&
    lm[16].y > lm[14].y
  )
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

// ─── Fist hold state ─────────────────────────────────────────────────────────
let fistHoldStart: number | null = null
const FIST_HOLD_MS = 1200

// ─── Widget cycling (swipe toggles between sprint / issues) ──────────────────
const CYCLE_WIDGETS: WidgetId[] = ['sprint', 'issues']
let cycleIndex = 0

// Base gesture types that can be dispatched via GESTURE_DETECTED
const BASE_GESTURES: GestureType[] = ['open_palm', 'pinch', 'swipe_left', 'swipe_right']

function handleGesture(gesture: ExtendedGestureType, dispatch: Dispatch, activeWidgets: Set<WidgetId>) {
  // Only dispatch GESTURE_DETECTED for the base public gesture types
  if (BASE_GESTURES.includes(gesture as GestureType)) {
    dispatch({ type: 'GESTURE_DETECTED', gesture: gesture as GestureType })
  }

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
    case 'thumbs_up':
      dispatch({ type: 'COMMAND_RECEIVED', text: '👍 confirmed' })
      break
    case 'thumbs_down':
      dispatch({ type: 'COMMAND_RECEIVED', text: '👎 dismissed' })
      break
    case 'peace_sign':
      dispatch({ type: 'SHOW_WIDGET', id: 'issues' })
      break
    case 'point_up':
      dispatch({ type: 'COMMAND_RECEIVED', text: '↑ scroll up' })
      break
    case 'fist':
      dispatch({ type: 'COMMAND_RECEIVED', text: '✊ data frozen' })
      break
    case 'rock_on':
      dispatch({ type: 'COMMAND_RECEIVED', text: '🤘 stealth toggle' })
      break
    case 'call_me':
      dispatch({ type: 'COMMAND_RECEIVED', text: '📞 speaking summary' })
      break
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
  private lastGesture: ExtendedGestureType | null = null
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
        fistHoldStart = null     // reset fist hold on hand loss
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

    let detected: ExtendedGestureType | null = null

    // Priority order: swipe → fist (with hold) → pinch → thumbs_up → thumbs_down
    //                 → peace_sign → rock_on → call_me → point_up → open_palm
    const swipe = detectSwipe(lm)
    if (swipe) {
      detected = swipe
      fistHoldStart = null
    } else if (isFist(lm)) {
      if (fistHoldStart === null) {
        fistHoldStart = now
      } else if (now - fistHoldStart >= FIST_HOLD_MS) {
        detected = 'fist'
        fistHoldStart = null  // reset after firing
      }
      // Fist not held long enough yet — don't fall through to other classifiers
      if (detected === null) {
        // Reset last gesture so we don't block re-detection once hold completes
        this.lastGesture = null
        return
      }
    } else {
      fistHoldStart = null  // clear hold state if fist released

      if (isPinch(lm)) {
        detected = 'pinch'
      } else if (isThumbsUp(lm)) {
        detected = 'thumbs_up'
      } else if (isThumbsDown(lm)) {
        detected = 'thumbs_down'
      } else if (isPeaceSign(lm)) {
        detected = 'peace_sign'
      } else if (isRockOn(lm)) {
        detected = 'rock_on'
      } else if (isCallMe(lm)) {
        detected = 'call_me'
      } else if (isPointUp(lm)) {
        detected = 'point_up'
      } else if (isOpenPalm(lm)) {
        detected = 'open_palm'
      }
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
