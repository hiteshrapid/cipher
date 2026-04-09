// CIPHER — GestureEngine
// MediaPipe Hands → finger-counting gesture detection → HUD commands

import type { GestureType, HUDAction, WidgetId } from '../types'
import { WIDGET_BOUNDS } from '../canvas/layers/WidgetLayer'

type Dispatch = (action: HUDAction) => void

interface Landmark { x: number; y: number; z: number }

// ─── Finger-to-widget group mapping ─────────────────────────────────────────
// Each finger maps to a group of widgets toggled together.
// Finger 1: Sprint + Issues (group); Fingers 2-4: single panel each.
const FINGER_WIDGETS: WidgetId[][] = [
  ['sprint'],             // finger 1 (drill into sprint for tickets)
  ['github'],             // finger 2
  ['calendar'],           // finger 3
  ['notifications'],      // finger 4
]

// All panels dispatched on open palm (5 fingers) — issues excluded (finger 1 only)
const ALL_PANELS: WidgetId[] = [
  'sprint', 'github', 'calendar',
  'notifications', 'activity',
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
  if (lm[8].y < lm[6].y - 0.03) count++
  if (lm[12].y < lm[10].y - 0.03) count++
  if (lm[16].y < lm[14].y - 0.03) count++
  if (lm[20].y < lm[18].y - 0.03) count++
  return count
}

function countNonThumbExtended(lm: Landmark[]): number {
  let count = 0
  if (lm[8].y < lm[6].y - 0.03) count++
  if (lm[12].y < lm[10].y - 0.03) count++
  if (lm[16].y < lm[14].y - 0.03) count++
  if (lm[20].y < lm[18].y - 0.03) count++
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

function isPinch(lm: Landmark[]): boolean {
  const dist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y)
  // Require ≥2 other fingers extended to distinguish from fist
  const othersUp = (lm[12].y < lm[10].y - 0.02 ? 1 : 0)
                 + (lm[16].y < lm[14].y - 0.02 ? 1 : 0)
                 + (lm[20].y < lm[18].y - 0.02 ? 1 : 0)
  return dist < 0.07 && othersUp >= 2
}

function getPinchCenter(lm: Landmark[], canvasW: number, canvasH: number): { x: number; y: number } {
  return {
    x: (1 - (lm[4].x + lm[8].x) / 2) * canvasW,
    y: ((lm[4].y + lm[8].y) / 2) * canvasH,
  }
}

// ─── Hit-test against active widget panels ──────────────────────────────────
function hitTestWidget(px: number, py: number, active: Set<WidgetId>): WidgetId | null {
  for (const [id, b] of Object.entries(WIDGET_BOUNDS)) {
    if (active.has(id as WidgetId) && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      return id as WidgetId
    }
  }
  return null
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
  | 'pinch'
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
    // 5 fingers — show ALL panels + exit focus mode
    case 'open_palm': {
      dispatch({ type: 'UNFOCUS_WIDGET' })
      dispatch({ type: 'COMMAND_RECEIVED', text: 'show all panels' })
      for (const id of ALL_PANELS) {
        dispatch({ type: 'SHOW_WIDGET', id })
      }
      break
    }

    // Pinch — focus on panel under pinch point (GitHub blocked)
    case 'pinch': {
      const hit = hitTestWidget(palmX, palmY, activeWidgets)
      if (hit && hit !== 'github') {
        dispatch({ type: 'FOCUS_WIDGET', id: hit })
        dispatch({ type: 'COMMAND_RECEIVED', text: `\u229A focusing ${hit}` })
      }
      break
    }

    // Fist (held 800ms) — close all panels
    case 'fist':
      dispatch({ type: 'HIDE_ALL' })
      break

    // Thumbs up — currently unassigned
    case 'thumbs_up':
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
  private focusedWidget: WidgetId | null = null
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

  updateFocusedWidget(widget: WidgetId | null) {
    this.focusedWidget = widget
  }

  getHandLandmarks(): Landmark[] | null {
    return this.lastLandmarks
  }

  /** Index fingertip position in canvas coords (for hover tracking in focus mode) */
  getIndexTipPosition(): { x: number; y: number } | null {
    if (!this.lastLandmarks) return null
    return {
      x: (1 - this.lastLandmarks[8].x) * this.canvasW,
      y: this.lastLandmarks[8].y * this.canvasH,
    }
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

    // ── Focus mode: freeze all gestures except open_palm (exit) and pinch (select item) ──
    if (this.focusedWidget) {
      if (now - this.lastGestureTime < this.COOLDOWN_MS) return
      const nonThumb = countNonThumbExtended(lm)
      if ((nonThumb === 4 && isThumbExtended(lm)) || countExtendedFingers(lm) === 5) {
        // Open palm → exit focus mode
        this.lastGestureTime = now
        this.lastGesture = 'open_palm'
        if (this.dispatch) {
          this.dispatch({ type: 'DRILL_BACK' })
          this.dispatch({ type: 'UNFOCUS_WIDGET' })
          this.dispatch({ type: 'COMMAND_RECEIVED', text: 'show all panels' })
          for (const id of ALL_PANELS) this.dispatch({ type: 'SHOW_WIDGET', id })
        }
      } else if (isPinch(lm) && this.lastGesture !== 'pinch') {
        // Pinch → select hovered item (HUDCanvas reads getIndexTipPosition to resolve item)
        this.lastGestureTime = now
        this.lastGesture = 'pinch'
        if (this.dispatch) {
          this.dispatch({ type: 'GESTURE_DETECTED', gesture: 'pinch' })
          this.dispatch({ type: 'COMMAND_RECEIVED', text: '\u229A selecting item' })
        }
      } else if (!isPinch(lm)) {
        this.lastGesture = null
      }
      return // block all other gestures in focus mode
    }

    if (now - this.lastGestureTime < this.COOLDOWN_MS) return

    let detected: ExtendedGestureType | null = null

    // ── Priority order: Rock On → Pinch → Fist (with hold) → Thumbs Up → Finger Count ──

    if (isRockOn(lm)) {
      detected = 'rock_on'
      fistHoldStart = null
    } else if (isPinch(lm)) {
      detected = 'pinch'
      fistHoldStart = null
    } else if (isFist(lm)) {
      if (fistHoldStart === null) {
        fistHoldStart = now
      } else if (now - fistHoldStart >= FIST_HOLD_MS) {
        detected = 'fist'
        fistHoldStart = null
      }
      if (detected === null) {
        // Fist accumulating — don't clear lastGesture (prevents spurious fires on jitter)
        return
      }
    } else {
      fistHoldStart = null

      // Check open palm FIRST — 4 non-thumb + thumb roughly extended = open palm
      const nonThumb = countNonThumbExtended(lm)
      if (nonThumb === 4 && isThumbExtended(lm)) {
        detected = 'open_palm'
      } else if (countExtendedFingers(lm) === 5) {
        detected = 'open_palm'
      } else if (isThumbsUp(lm)) {
        detected = 'thumbs_up'
      } else if (nonThumb >= 1 && nonThumb <= 4) {
        detected = `finger_${nonThumb}` as ExtendedGestureType
      }
    }

    if (detected && detected !== this.lastGesture) {
      this.lastGestureTime = now
      this.lastGesture = detected
      // Use pinch centre (thumb+index midpoint) for pinch, palm centre for everything else
      const coords = (detected === 'pinch' && this.lastLandmarks)
        ? getPinchCenter(this.lastLandmarks, this.canvasW, this.canvasH)
        : this.lastLandmarks
          ? getPalmCenter(this.lastLandmarks, this.canvasW, this.canvasH)
          : { x: 0, y: 0 }
      handleGesture(detected, this.dispatch, this.activeWidgets, coords.x, coords.y)
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
