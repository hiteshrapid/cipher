// CIPHER — HandLayer
// Renders the MediaPipe hand skeleton with per-finger neon colors + open-palm web effect

interface Lm { x: number; y: number; z: number }

// ─── Per-finger neon palette ────────────────────────────────────────────────
const FINGER_COLORS = [
  { line: '#00e5ff', dot: '#80f2ff', glow: 'rgba(0,229,255,0.9)'  },  // thumb  — cyan
  { line: '#00ff41', dot: '#80ffaa', glow: 'rgba(0,255,65,0.9)'   },  // index  — matrix green
  { line: '#ff0077', dot: '#ff80bb', glow: 'rgba(255,0,119,0.9)'  },  // middle — hot pink
  { line: '#cc44ff', dot: '#e699ff', glow: 'rgba(204,68,255,0.9)' },  // ring   — electric purple
  { line: '#ff8c00', dot: '#ffc266', glow: 'rgba(255,140,0,0.9)'  },  // pinky  — amber
]

// Map landmark index → finger index (0=thumb…4=pinky)
function fingerIdx(i: number): number {
  if (i <= 4)  return 0
  if (i <= 8)  return 1
  if (i <= 12) return 2
  if (i <= 16) return 3
  return 4
}

const TIPS = [4, 8, 12, 16, 20]

// Connections per finger (joint pairs)
const FINGER_SEGS: Array<Array<[number, number]>> = [
  [[0,1],[1,2],[2,3],[3,4]],
  [[5,6],[6,7],[7,8]],
  [[9,10],[10,11],[11,12]],
  [[13,14],[14,15],[15,16]],
  [[17,18],[18,19],[19,20]],
]

// Knuckle / palm connections drawn in neutral green
const PALM_SEGS: Array<[number, number]> = [
  [0,5],[0,9],[0,13],[0,17],
  [5,9],[9,13],[13,17],
]

function lx(lm: Lm, w: number) { return lm.x * w }
function ly(lm: Lm, h: number) { return lm.y * h }

function noGlow(ctx: CanvasRenderingContext2D) {
  ctx.shadowBlur  = 0
  ctx.shadowColor = 'transparent'
}

// Detect open palm: index→pinky tips above their PIP joint
function isOpenPalmShape(lm: Lm[]): boolean {
  return TIPS.slice(1).every(tip => lm[tip].y < lm[tip - 2].y)
}

/**
 * Draw the hand skeleton on the canvas.
 * @param landmarks  21 MediaPipe hand landmarks (normalized 0-1)
 * @param w / h      Canvas pixel dimensions
 * @param lastGesture  Latest gesture state from HUD (type + timestamp)
 * @param t          performance.now() for animation
 */
export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Lm[],
  w: number,
  h: number,
  lastGesture: { type: string; timestamp: number } | null,
  t: number,
) {
  if (!landmarks || landmarks.length < 21) return

  const now = Date.now()
  const gestureAge = lastGesture ? now - lastGesture.timestamp : Infinity
  // Pulse fades over 700ms after a gesture fires
  const pulse = gestureAge < 700 ? Math.max(0, 1 - gestureAge / 700) : 0

  ctx.save()

  // ─── Palm connections ────────────────────────────────────────────────────
  for (const [a, b] of PALM_SEGS) {
    const A = landmarks[a]
    const B = landmarks[b]
    ctx.beginPath()
    ctx.moveTo(lx(A, w), ly(A, h))
    ctx.lineTo(lx(B, w), ly(B, h))
    ctx.strokeStyle = '#00ff41'
    ctx.globalAlpha = 0.18 + pulse * 0.25
    ctx.lineWidth   = 1
    ctx.shadowBlur  = 4 + pulse * 10
    ctx.shadowColor = '#00ff41'
    ctx.stroke()
    ctx.globalAlpha = 1
    noGlow(ctx)
  }

  // ─── Finger connections (per-finger color) ────────────────────────────────
  FINGER_SEGS.forEach((segs, fi) => {
    const c = FINGER_COLORS[fi]
    ctx.shadowColor = c.glow
    for (const [a, b] of segs) {
      const A = landmarks[a]
      const B = landmarks[b]
      ctx.beginPath()
      ctx.moveTo(lx(A, w), ly(A, h))
      ctx.lineTo(lx(B, w), ly(B, h))
      ctx.strokeStyle = c.line
      ctx.globalAlpha = 0.70 + pulse * 0.30
      ctx.lineWidth   = 1.8 + pulse * 1.2
      ctx.shadowBlur  = 10 + pulse * 18
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  })
  noGlow(ctx)

  // ─── Open-palm web: animated dashed lines between all fingertips ──────────
  if (isOpenPalmShape(landmarks)) {
    ctx.setLineDash([3, 5])
    ctx.lineWidth = 0.9
    for (let i = 0; i < TIPS.length; i++) {
      for (let j = i + 1; j < TIPS.length; j++) {
        const A  = landmarks[TIPS[i]]
        const B  = landmarks[TIPS[j]]
        const ci = FINGER_COLORS[i]
        // Each web strand animates with a different phase
        const webPulse = 0.5 + 0.5 * Math.sin(t / 700 + i * 1.3 + j * 0.9)
        ctx.globalAlpha = 0.20 + webPulse * 0.22
        ctx.strokeStyle = ci.line
        ctx.shadowBlur  = 6 + webPulse * 8
        ctx.shadowColor = ci.glow
        ctx.beginPath()
        ctx.moveTo(lx(A, w), ly(A, h))
        ctx.lineTo(lx(B, w), ly(B, h))
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
    ctx.setLineDash([])
    noGlow(ctx)
  }

  // ─── Landmark dots ────────────────────────────────────────────────────────
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i]
    const fi = fingerIdx(i)
    const c  = FINGER_COLORS[fi]
    const isTip = TIPS.includes(i)
    const r = isTip ? 4.5 + pulse * 3 : 2.5

    ctx.beginPath()
    ctx.arc(lx(lm, w), ly(lm, h), r, 0, Math.PI * 2)
    ctx.fillStyle   = isTip ? c.dot : c.line
    ctx.globalAlpha = 0.85 + pulse * 0.15
    ctx.shadowBlur  = isTip ? 14 + pulse * 14 : 6
    ctx.shadowColor = c.glow
    ctx.fill()
    ctx.globalAlpha = 1
    noGlow(ctx)
  }

  // ─── Gesture label near the wrist ────────────────────────────────────────
  if (lastGesture && pulse > 0.08) {
    const wrist = landmarks[0]
    ctx.font         = `bold 12px 'Courier New', monospace`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'top'
    ctx.globalAlpha  = pulse
    ctx.fillStyle    = '#00ff41'
    ctx.shadowBlur   = 14
    ctx.shadowColor  = '#00ff41'
    const GESTURE_LABELS: Record<string, string> = {
      open_palm: '✋ SHOW ALL',
      fist: '✊ HIDE ALL',
      pinch: '🤏 CLOSE ALL',
      rock_on: '🤘 LISTENING',
      finger_1: '☝ OVERVIEW',
      finger_2: '✌ ISSUES',
      finger_3: '🤟 GITHUB',
      finger_4: '🖖 CALENDAR',
      thumbs_up: '👍 CONFIRMED',
    }
    const label = GESTURE_LABELS[lastGesture.type] ?? lastGesture.type.replace(/_/g, ' ').toUpperCase()
    ctx.fillText(`◈ ${label}`, lx(wrist, w), ly(wrist, h) + 24)
    ctx.globalAlpha = 1
    noGlow(ctx)
  }

  ctx.restore()
}
