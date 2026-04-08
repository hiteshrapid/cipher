// CIPHER — GestureEngine
// MediaPipe Hands → finger-counting gesture detection → HUD commands

import type { GestureType, HUDAction, WidgetId } from '../types'

type Dispatch = (action: HUDAction) => void

interface Landmark { x: number; y: number; z: number }

// ─── Finger-to-widget group mapping ─────────────────────────────────────────
// Each finger maps to a group of widgets toggled together.
// Finger 1: Sprint + Issues (group); Fingers 2-4: single panel each.
const FINGER_WIDGETS: WidgetId[][] = [
  ['sprint', 'issues'],   // finger 1
  ['github'],             // finger 2
  ['calendar'],           // finger 3
  ['notifications'],      // finger 4
]

// All panels dispatched on open palm (5 fingers)
const ALL_PANELS: WidgetId[] = [
  'sprint', 'issues', 'github', 'calendar',
  'notifications', 'activity', 'metrics',
]

// Base gesture types that can be dispatched via GESTURE_DETECTED
const BASE_GESTURES: GestureType[] = ['open_palm', 'swipe_left', 'swipe_right']

// ─── Finger classification ───────────────────────────────────────────────────

function isThumbExtended(lm: Landmark[]): boolean {
  return Math.abs(lm[4].x - lm[2].x) > 0.06
}

function countExtendedFingers(lm: Landmark[]): number {
  let count = 0
  if (isThumbExtended(lm)) count++
  if (lm[8].y < lm[6].y - 0.02) count++
  if (lm[12].y < lm[10].y - 0.02) count++
  if (lm[16].y < lm[14].y - 0.02) count++
  if (lm[20].y < lm[18].y - 0.02) count++
  return count
}

function countNonThumbExtended(lm: Landmark[]): number {
  let count = 0
  if (lm[8].y < lm[6].y - 0.02) count++
  if (lm[12].y < lm[10].y - 0.02) count++
  if (lm[16].y < lm[14].y - 0.02) count++
  if (lm[20].y < lm[18].y - 0.02) count++
  return count
}

// ─── Gesture classifiers ─────────────────────────────────────────────────────

function isThumbsUp(lm: Landmark[]): boolean {
  return isThumbExtended(lm) && countNonThumbExtended(lm) === 0
}

function isFist(lm: Landmark[]): boolean {
  return countExtendedFingers(lm) === 0 && !isThumbExtended(lm)
}

function isRockOn(lm: Landmark[]): boolean {
  const indexUp   = lm[8].y < lm[6].y - 0.02
  const pinkyUp   = lm[20].y < lm[18].y - 0.02
  const middleCurled = lm[12].y > lm[10].y - 0.01
  const ringCurled   = lm[16].y > lm[14].y - 0.01
  return indexUp && pinkyUp && middleCurled && ringCurled
}

// ─── Palm center (canvas pixel coords) ──────────────────────────────────────
// Averages wrist + 4 knuckle bases; mirrors x for front-facing camera.

function getPalmCenter(lm: Landmark[], canvasW: number, canvasH: number): { x: number; y: number } {
  const ids = [0, 5, 9, 13, 17]
  let cx = 0, cy = 0
  for (const id of ids) {
    cx += (1 - lm[id].x)
    cy += lm[id].y
  }
  return {
    x: (cx / ids.length) * canvasW,
    y: (cy / ids.length) * canvasH,
  }
}

// ─── Extended gesture type ───────────────────────────────────────────────────
type ExtendedGestureType =
  | GestureType
  | 'fist'
  | 'thumbs_up'
  | 'rock_on'
  | 'finger_1'
  | 'finger_2'
  | 'finger_3'
  | 'finger_4'

// ─── Fist hold state ─────────────────────────────────────────────────────────
let fistHoldStart: number | null = null
const FIST_HOLD_MS = 800

// ─── Action dispatcher ───────────────────────────────────────────────────────

function handleGesture(
  gesture: ExtendedGestureType,
  dispatch: Dispatch,
  activeWidgets: Set<WidgetId>,
  palmX: number,
  palmY: number,
) {
  if (BASE_GESTURES.includes(gesture as GestureType)) {
    dispatch({ type: 'GESTURE_DETECTED', gesture: gesture as GestureType })
  }

  switch (gesture) {
    // 5 fingers — show ALL panels
    case 'open_palm': {
      dispatch({ type: 'COMMAND_RECEIVED', text: 'show all panels' })
      for (const id of ALL_PANELS) {
        dispatch({ type: 'SHOW_WIDGET', id })
      }
      break
    }

    // Fist (held 800ms) — close all panels
    case 'fist':
      dispatch({ type: 'HIDE_ALL' })
      break

    // Thumbs up — toggle stealth mode
    case 'thumbs_up':
      dispatch({ type: 'TOGGLE_STEALTH' })
      break

    // Rock on — toggle interactive mode (transcript panel at palm)
    case 'rock_on':
      dispatch({ type: 'TOGGLE_TRANSCRIPT', x: palmX, y: palmY })
      break

    // 1-4 fingers — toggle widget groups
    case 'finger_1':
    case 'finger_2':
    case 'finger_3':
    case 'finger_4': {
      const idx = Number(gesture.split('_')[1]) - 1
      const group = FINGER_WIDGETS[idx]
      const allActive = group.every(id => activeWidgets.has(id))
      if (allActive) {
        for (const id of group) dispatch({ type: 'HIDE_WIDGET', id })
      } else {
        for (const id of group) dispatch({ type: 'SHOW_WIDGET', id })
      }
      break
    }
  }
}

// ─── GestureEngine class ─────────────────────────────────────────────────────
export class GestureEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private landmarker: any = null
  private dispatch: Dispatch | null = null
  private videoEl: HTMLVideoElement | null = null
  private rafId: number | null = null
  private lastGestureTime = 0
  private lastGesture: ExtendedGestureType | null = null
  private COOLDOWN_MS = 600
  private activeWidgets: Set<WidgetId> = new Set()
  private lastLandmarks: Landmark[] | null = null
  private lastDetectTime = 0
  private canvasW = 1280
  private canvasH = 720

  setCanvasSize(w: number, h: number) {
    this.canvasW = w
    this.canvasH = h
  }

  async init(videoEl: HTMLVideoElement, dispatch: Dispatch): Promise<boolean> {
    this.videoEl  = videoEl
    this.dispatch = dispatch

    try {
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

  getHandLandmarks(): Landmark[] | null {
    return this.lastLandmarks
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

    const now = performance.now()
    if (now - this.lastDetectTime < 100) return
    this.lastDetectTime = now

    try {
      const results = this.landmarker.detectForVideo(this.videoEl, now)
      if (!results.landmarks || results.landmarks.length === 0) {
        this.lastLandmarks = null
        fistHoldStart = null
        return
      }

      const lm: Landmark[] = results.landmarks[0]
      this.classifyAndDispatch(lm)
    } catch { /* ignore frame errors */ }
  }

  private classifyAndDispatch(lm: Landmark[]) {
    this.lastLandmarks = lm
    if (!this.dispatch) return
    const now = Date.now()
    if (now - this.lastGestureTime < this.COOLDOWN_MS) return

    let detected: ExtendedGestureType | null = null

    // ── Priority order: Rock On → Fist (with hold) → Thumbs Up → Finger Count ──

    if (isRockOn(lm)) {
      detected = 'rock_on'
      fistHoldStart = null
    } else if (isFist(lm)) {
      if (fistHoldStart === null) {
        fistHoldStart = now
      } else if (now - fistHoldStart >= FIST_HOLD_MS) {
        detected = 'fist'
        fistHoldStart = null
      }
      if (detected === null) {
        this.lastGesture = null
        return
      }
    } else {
      fistHoldStart = null

      if (isThumbsUp(lm)) {
        detected = 'thumbs_up'
      } else {
        const count = countExtendedFingers(lm)
        if (count === 5) {
          detected = 'open_palm'
        } else if (count >= 1 && count <= 4) {
          const nonThumb = countNonThumbExtended(lm)
          if (nonThumb >= 1 && nonThumb <= 4) {
            detected = `finger_${nonThumb}` as ExtendedGestureType
          }
        }
      }
    }

    if (detected && detected !== this.lastGesture) {
      this.lastGestureTime = now
      this.lastGesture = detected
      const palm = this.lastLandmarks
        ? getPalmCenter(this.lastLandmarks, this.canvasW, this.canvasH)
        : { x: 0, y: 0 }
      handleGesture(detected, this.dispatch, this.activeWidgets, palm.x, palm.y)
    } else if (!detected) {
      this.lastGesture = null
    }
  }

  destroy() {
    this.lastLandmarks = null
    this.stop()
    this.landmarker?.close?.()
    this.landmarker = null
    this.dispatch   = null
    this.videoEl    = null
  }
}
