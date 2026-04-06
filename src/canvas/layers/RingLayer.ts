// CIPHER — RingLayer
// Draws JARVIS-style HUD chrome: rings, brackets, scanline, status bar

const C = {
  primary:   'rgba(0, 255, 65, 0.85)',
  mid:       'rgba(0, 255, 65, 0.45)',
  dim:       'rgba(0, 255, 65, 0.18)',
  ghost:     'rgba(0, 255, 65, 0.07)',
  glow:      '#00ff41',
  glowDim:   'rgba(0, 255, 65, 0.4)',
  font:      "'Courier New', Courier, monospace",
}

function glow(ctx: CanvasRenderingContext2D, blur = 12) {
  ctx.shadowBlur  = blur
  ctx.shadowColor = C.glow
}

function noGlow(ctx: CanvasRenderingContext2D) {
  ctx.shadowBlur  = 0
  ctx.shadowColor = 'transparent'
}

// Fractional arc segments on the outer ring (decorative gaps)
const OUTER_GAPS = [
  [0.08, 0.14],   // gap at ~top-right
  [0.36, 0.40],   // gap at ~bottom-right
  [0.58, 0.64],   // gap at ~bottom-left
  [0.84, 0.90],   // gap at ~top-left
]

// ─── Outer ring ──────────────────────────────────────────────────────────────
function drawOuterRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number) {
  const angle = (t / 60000) * Math.PI * 2  // 1 full rotation per 60s

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  ctx.lineWidth = 1.2
  ctx.strokeStyle = C.mid
  glow(ctx, 8)

  // Draw arcs with gaps
  let prev = 0
  for (const [gStart, gEnd] of OUTER_GAPS) {
    const a1 = prev  * Math.PI * 2
    const a2 = gStart * Math.PI * 2
    ctx.beginPath()
    ctx.arc(0, 0, radius, a1 - Math.PI / 2, a2 - Math.PI / 2)
    ctx.stroke()
    prev = gEnd
  }
  // final segment
  ctx.beginPath()
  ctx.arc(0, 0, radius, prev * Math.PI * 2 - Math.PI / 2, 2 * Math.PI - Math.PI / 2)
  ctx.stroke()

  // Tick marks at gap endpoints
  ctx.strokeStyle = C.primary
  ctx.lineWidth = 1.5
  glow(ctx, 14)
  for (const [, gEnd] of OUTER_GAPS) {
    const a = gEnd * Math.PI * 2 - Math.PI / 2
    const inner = radius - 8
    const outer = radius + 8
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner)
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer)
    ctx.stroke()
  }

  noGlow(ctx)
  ctx.restore()
}

// ─── Middle ring (counter-rotating) ──────────────────────────────────────────
function drawMiddleRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number) {
  const angle = -(t / 30000) * Math.PI * 2  // counter-rotate, 30s period

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  // Dashed inner ring
  ctx.setLineDash([4, 12])
  ctx.lineWidth = 1
  ctx.strokeStyle = C.dim
  noGlow(ctx)
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // Small compass dots
  ctx.fillStyle = C.primary
  glow(ctx, 16)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(Math.cos(a) * radius, Math.sin(a) * radius, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  noGlow(ctx)
  ctx.restore()
}

// ─── Inner decorative arcs ────────────────────────────────────────────────────
function drawInnerArcs(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, t: number) {
  const angle = (t / 45000) * Math.PI * 2

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)

  ctx.lineWidth = 2
  ctx.strokeStyle = C.primary
  glow(ctx, 18)

  // 4 short arcs, evenly spaced at 90° offsets
  for (let i = 0; i < 4; i++) {
    const base = (i / 4) * Math.PI * 2 - Math.PI / 2
    const arc  = Math.PI / 6  // 30° arc
    ctx.beginPath()
    ctx.arc(0, 0, radius, base - arc / 2, base + arc / 2)
    ctx.stroke()
  }

  noGlow(ctx)
  ctx.restore()
}

// ─── Corner brackets ─────────────────────────────────────────────────────────
function drawCornerBrackets(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pad  = 24
  const len  = 32
  const gap  = 6

  ctx.lineWidth   = 1.8
  ctx.strokeStyle = C.primary
  glow(ctx, 14)

  const corners = [
    { x: pad, y: pad, sx: 1, sy: 1 },         // top-left
    { x: w - pad, y: pad, sx: -1, sy: 1 },    // top-right
    { x: pad, y: h - pad, sx: 1, sy: -1 },    // bottom-left
    { x: w - pad, y: h - pad, sx: -1, sy: -1 }, // bottom-right
  ]

  for (const { x, y, sx, sy } of corners) {
    ctx.beginPath()
    // horizontal arm
    ctx.moveTo(x + sx * gap, y)
    ctx.lineTo(x + sx * (gap + len), y)
    // vertical arm
    ctx.moveTo(x, y + sy * gap)
    ctx.lineTo(x, y + sy * (gap + len))
    ctx.stroke()

    // small corner dot
    ctx.fillStyle = C.primary
    ctx.beginPath()
    ctx.arc(x, y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }

  noGlow(ctx)
}

// ─── Scanline ─────────────────────────────────────────────────────────────────
function drawScanline(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const period = 6000  // full top-to-bottom pass every 6s
  const y = ((t % period) / period) * h

  const grad = ctx.createLinearGradient(0, y - 40, 0, y + 40)
  grad.addColorStop(0,   'transparent')
  grad.addColorStop(0.4, C.ghost)
  grad.addColorStop(0.5, C.dim)
  grad.addColorStop(0.6, C.ghost)
  grad.addColorStop(1,   'transparent')

  ctx.fillStyle = grad
  ctx.fillRect(0, y - 40, w, 80)
}

// ─── Status bar ──────────────────────────────────────────────────────────────
export function drawStatusBar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  connectorStatuses: Array<{ label: string; status: string }>,
) {
  const barH = 28
  const y    = h - barH

  // Background strip
  ctx.fillStyle = 'rgba(0, 20, 0, 0.7)'
  ctx.fillRect(0, y, w, barH)

  // Top border
  ctx.strokeStyle = C.mid
  ctx.lineWidth   = 0.5
  glow(ctx, 6)
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(w, y)
  ctx.stroke()
  noGlow(ctx)

  // Time
  const now  = new Date()
  const time = now.toTimeString().slice(0, 8)

  // Build status string
  const connStr = connectorStatuses.length > 0
    ? connectorStatuses.map(c => {
        const dot = c.status === 'connected' ? '◉' : c.status === 'error' ? '✕' : '○'
        return `${dot} ${c.label.toUpperCase()}`
      }).join('  ·  ')
    : '○ NO CONNECTORS'

  const text = `CIPHER · v1.0 · ${time}  ·  ${connStr}`

  ctx.font      = `11px ${C.font}`
  ctx.fillStyle = C.mid
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  glow(ctx, 8)
  ctx.fillText(text, w / 2, y + barH / 2)
  noGlow(ctx)
}

// ─── Command feedback flash ───────────────────────────────────────────────────
export function drawCommandFeedback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
  age: number,   // ms since command fired
) {
  if (age > 1800) return

  const opacity = Math.max(0, 1 - age / 1800)
  const y = h - 60

  ctx.font         = `13px ${C.font}`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle    = `rgba(0, 255, 65, ${opacity})`
  ctx.shadowBlur   = 12 * opacity
  ctx.shadowColor  = C.glow
  ctx.fillText(`▶  ${text.toUpperCase()}`, w / 2, y)
  noGlow(ctx)
}

// ─── Clock (top-right, always-on) ─────────────────────────────────────────────
export function drawClock(ctx: CanvasRenderingContext2D, w: number) {
  const now   = new Date()
  const time  = now.toTimeString().slice(0, 8)
  const date  = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()

  const pad = 30
  const x   = w - pad

  ctx.textAlign    = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle    = C.primary
  glow(ctx, 12)
  ctx.font = `20px ${C.font}`
  ctx.fillText(time, x, 30)

  ctx.font      = `10px ${C.font}`
  ctx.fillStyle = C.mid
  noGlow(ctx)
  ctx.fillText(date, x, 55)
}

// ─── Main entry: draw all chrome ─────────────────────────────────────────────
export function drawHUDChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  connectorStatuses: Array<{ label: string; status: string }>,
) {
  const cx = w / 2
  const cy = h / 2

  // Ring radii as fraction of shorter dimension
  const baseR  = Math.min(w, h) * 0.36
  const outerR = baseR * 1.10
  const innerR = baseR * 0.72

  drawOuterRing(ctx, cx, cy, outerR, t)
  drawMiddleRing(ctx, cx, cy, baseR,  t)
  drawInnerArcs( ctx, cx, cy, innerR, t)
  drawCornerBrackets(ctx, w, h)
  drawScanline(ctx, w, h, t)
  drawStatusBar(ctx, w, h, connectorStatuses)
  drawClock(ctx, w)
}
