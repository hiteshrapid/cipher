// CIPHER — RingLayer
// Draws JARVIS-style HUD chrome: rings, brackets, scanline, status bar

// ─── Alert Level ─────────────────────────────────────────────────────────────
/** Operational mode that scales ring brightness, scanline intensity, and colour */
export type AlertLevel = 'STEALTH' | 'NORMAL' | 'ALERT' | 'CRITICAL'

export interface RingColors {
  primary: string
  mid:     string
  dim:     string
  ghost:   string
  glow:    string
  glowDim: string
}

/** Returns the canonical colour set for a given AlertLevel */
export function getRingColors(level: AlertLevel): RingColors {
  switch (level) {
    case 'STEALTH':
      return {
        primary: 'rgba(0, 200, 50, 0.30)',
        mid:     'rgba(0, 200, 50, 0.14)',
        dim:     'rgba(0, 200, 50, 0.06)',
        ghost:   'rgba(0, 200, 50, 0.02)',
        glow:    'rgba(0, 200, 50, 0.0)',  // no bloom in stealth
        glowDim: 'rgba(0, 200, 50, 0.0)',
      }
    case 'NORMAL':
      return {
        primary: 'rgba(0, 255, 65, 0.85)',
        mid:     'rgba(0, 255, 65, 0.45)',
        dim:     'rgba(0, 255, 65, 0.18)',
        ghost:   'rgba(0, 255, 65, 0.07)',
        glow:    '#00ff41',
        glowDim: 'rgba(0, 255, 65, 0.4)',
      }
    case 'ALERT':
      return {
        primary: 'rgba(255, 160, 0, 0.90)',
        mid:     'rgba(255, 160, 0, 0.55)',
        dim:     'rgba(255, 160, 0, 0.22)',
        ghost:   'rgba(255, 160, 0, 0.08)',
        glow:    '#ffa000',
        glowDim: 'rgba(255, 160, 0, 0.45)',
      }
    case 'CRITICAL':
      return {
        primary: 'rgba(255, 50, 50, 0.95)',
        mid:     'rgba(255, 50, 50, 0.60)',
        dim:     'rgba(255, 50, 50, 0.25)',
        ghost:   'rgba(255, 50, 50, 0.09)',
        glow:    '#ff3232',
        glowDim: 'rgba(255, 50, 50, 0.5)',
      }
  }
}

// Default colours (NORMAL) — updated by drawHUDChrome each frame
let C = getRingColors('NORMAL')

const FONT = "'Courier New', Courier, monospace"

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

  ctx.font      = `11px ${FONT}`
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

  ctx.font         = `13px ${FONT}`
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
  ctx.font = `20px ${FONT}`
  ctx.fillText(time, x, 30)

  ctx.font      = `10px ${FONT}`
  ctx.fillStyle = C.mid
  noGlow(ctx)
  ctx.fillText(date, x, 55)
}

// ─── Waveform ring ────────────────────────────────────────────────────────────
/**
 * Draws an audio waveform visualisation mapped onto a circle.
 * `samples` is a Float32Array or number[] of values in the range [-1, 1]
 * (e.g. from Web Audio AnalyserNode.getFloatTimeDomainData).
 * When samples is empty or all-zero, draws a quiet flat circle.
 */
function drawWaveformRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  samples: Float32Array | number[],
  t: number,
) {
  const count = samples.length
  if (count === 0) return

  // Slowly rotate the ring so silence still looks alive
  const idleAngle = (t / 20000) * Math.PI * 2
  const amplitude = radius * 0.20    // max outward excursion = 20% of radius

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(idleAngle)

  ctx.beginPath()
  for (let i = 0; i <= count; i++) {
    const sample = samples[i % count] ?? 0
    const r = radius + sample * amplitude
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(angle) * r
    const y = Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()

  ctx.strokeStyle = C.mid
  ctx.lineWidth   = 1.5
  ctx.shadowBlur  = 10
  ctx.shadowColor = C.glow
  ctx.stroke()

  noGlow(ctx)
  ctx.restore()
}

// ─── Alert-level badge (top-left) ────────────────────────────────────────────
function drawAlertBadge(ctx: CanvasRenderingContext2D, level: AlertLevel) {
  if (level === 'NORMAL') return   // suppress in normal operation

  const x   = 30
  const y   = 30
  const pad = { x: 10, y: 5 }

  ctx.font         = `11px ${FONT}`
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'

  const label  = `◈ ${level}`
  const tw     = ctx.measureText(label).width
  const bw     = tw + pad.x * 2
  const bh     = 20

  // Background pill
  ctx.fillStyle = level === 'STEALTH'
    ? 'rgba(0, 180, 50, 0.10)'
    : level === 'ALERT'
      ? 'rgba(255, 140, 0, 0.15)'
      : 'rgba(255, 40, 40, 0.18)'

  ctx.beginPath()
  ctx.roundRect(x - pad.x, y - pad.y, bw, bh, 3)
  ctx.fill()

  // Border
  ctx.strokeStyle = C.mid
  ctx.lineWidth   = 0.8
  glow(ctx, 6)
  ctx.beginPath()
  ctx.roundRect(x - pad.x, y - pad.y, bw, bh, 3)
  ctx.stroke()

  // Label
  ctx.fillStyle = C.primary
  glow(ctx, 10)
  ctx.fillText(label, x, y)
  noGlow(ctx)
}

// ─── Main entry: draw all chrome ─────────────────────────────────────────────
/**
 * @param connectorStatuses — connector health shown in the status bar
 * @param alertLevel        — operational mode; changes ring colours (default: 'NORMAL')
 * @param waveformSamples   — optional audio samples for the waveform ring
 */
export function drawHUDChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  connectorStatuses: Array<{ label: string; status: string }>,
  alertLevel: AlertLevel = 'NORMAL',
  waveformSamples?: Float32Array | number[],
  voiceStatus?: string,
) {
  // Update module-level colour palette to match the current alert level
  C = getRingColors(alertLevel)

  const cx = w / 2
  const cy = h / 2

  // Ring radii as fraction of shorter dimension
  const baseR  = Math.min(w, h) * 0.36
  const outerR = baseR * 1.10
  const innerR = baseR * 0.72
  const waveR  = baseR * 0.88   // waveform sits between middle and outer

  // In STEALTH mode suppress scanline and corner glow — rings still drawn at low opacity
  const isStealth = alertLevel === 'STEALTH'

  drawOuterRing(ctx, cx, cy, outerR, t)
  drawMiddleRing(ctx, cx, cy, baseR,  t)

  if (waveformSamples && waveformSamples.length > 0) {
    drawWaveformRing(ctx, cx, cy, waveR, waveformSamples, t)
  }

  drawInnerArcs(ctx, cx, cy, innerR, t)
  drawCornerBrackets(ctx, w, h)

  if (!isStealth) {
    drawScanline(ctx, w, h, t)
  }

  drawStatusBar(ctx, w, h, connectorStatuses)
  drawClock(ctx, w)
  drawAlertBadge(ctx, alertLevel)

  // Listening indicator (top center)
  if (voiceStatus && voiceStatus !== 'inactive') {
    drawListeningIndicator(ctx, w, voiceStatus, t)
  }
}

// ─── Listening Indicator ──────────────────────────────────────────────────────
function drawListeningIndicator(
  ctx: CanvasRenderingContext2D,
  w: number,
  voiceStatus: string,
  t: number,
) {
  ctx.save()
  const cx = w / 2
  const y = 18

  if (voiceStatus === 'listening') {
    const pulse = 0.5 + 0.5 * Math.sin(t / 500)
    ctx.globalAlpha = 0.4 + 0.6 * pulse
    ctx.font = '10px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(0, 255, 65, 0.85)'
    ctx.shadowColor = '#00ff41'
    ctx.shadowBlur = 10 * pulse
    ctx.fillText('\u25C8 CIPHER LISTENING', cx, y)
  } else if (voiceStatus === 'denied') {
    ctx.globalAlpha = 0.7
    ctx.font = '10px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255, 80, 80, 0.7)'
    ctx.shadowColor = '#ff3232'
    ctx.shadowBlur = 6
    ctx.fillText('\u2716 MIC DENIED', cx, y)
  } else if (voiceStatus === 'error') {
    ctx.globalAlpha = 0.7
    ctx.font = '10px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255, 160, 0, 0.7)'
    ctx.shadowColor = '#ffa000'
    ctx.shadowBlur = 6
    ctx.fillText('\u26A0 VOICE ERROR', cx, y)
  }

  ctx.restore()
}
