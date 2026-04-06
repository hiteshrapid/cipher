// CIPHER — WidgetLayer
// Draws floating HUD data panels onto the canvas

import type { ConnectorData, WidgetId, SprintData, JiraIssue } from '../../types'

const C = {
  primary:  'rgba(0, 255, 65, 0.85)',
  mid:      'rgba(0, 255, 65, 0.50)',
  dim:      'rgba(0, 255, 65, 0.25)',
  fill:     'rgba(0, 20, 0, 0.75)',
  font:     "'Courier New', Courier, monospace",
  glow:     '#00ff41',
}

function glow(ctx: CanvasRenderingContext2D, blur = 10) {
  ctx.shadowBlur  = blur
  ctx.shadowColor = C.glow
}
function noGlow(ctx: CanvasRenderingContext2D) {
  ctx.shadowBlur  = 0
  ctx.shadowColor = 'transparent'
}

// ─── Widget panel shell ───────────────────────────────────────────────────────
function drawPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  title: string,
  age: number,   // ms since widget was shown (for entrance animation)
) {
  // Entrance: slide in from left over 300ms
  const progress = Math.min(1, age / 300)
  const eased    = 1 - Math.pow(1 - progress, 3)  // cubic ease-out
  const dx       = (1 - eased) * -60
  const alpha    = eased

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(dx, 0)

  // Panel background
  ctx.fillStyle = C.fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 4)
  ctx.fill()

  // Border
  ctx.strokeStyle = C.mid
  ctx.lineWidth   = 1
  glow(ctx, 8)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 4)
  ctx.stroke()
  noGlow(ctx)

  // Title bar
  ctx.fillStyle = 'rgba(0, 255, 65, 0.08)'
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w - 2, 26, [3, 3, 0, 0])
  ctx.fill()

  // Title text
  ctx.font         = `11px ${C.font}`
  ctx.fillStyle    = C.primary
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'middle'
  glow(ctx, 10)
  ctx.fillText(`▸ ${title}`, x + 10, y + 14)
  noGlow(ctx)

  // Title separator
  ctx.strokeStyle = C.dim
  ctx.lineWidth   = 0.5
  ctx.beginPath()
  ctx.moveTo(x + 6, y + 27)
  ctx.lineTo(x + w - 6, y + 27)
  ctx.stroke()

  ctx.restore()
}

// ─── Sprint widget ────────────────────────────────────────────────────────────
function drawSprintWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  data: SprintData | null,
  age: number,
) {
  const W = 290
  const H = data ? 40 + 30 + data.issues.slice(0, 3).length * 22 + 16 : 110

  drawPanel(ctx, x, y, W, H, 'SPRINT STATUS', age)

  const progress = Math.min(1, age / 300)
  ctx.save()
  ctx.globalAlpha = Math.min(1, age / 300)
  ctx.translate((1 - progress) * -60, 0)

  if (!data) {
    ctx.font      = `10px ${C.font}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'left'
    ctx.fillText('Loading...', x + 12, y + 50)
    ctx.restore()
    return
  }

  const iy = y + 36

  // Sprint name
  ctx.font         = `12px ${C.font}`
  ctx.fillStyle    = C.primary
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'middle'
  glow(ctx, 8)
  ctx.fillText(data.sprintName.toUpperCase(), x + 12, iy)
  noGlow(ctx)

  // Open / Done counters
  const cx2 = x + W - 12
  ctx.textAlign = 'right'
  ctx.font      = `10px ${C.font}`
  ctx.fillStyle = 'rgba(255, 140, 0, 0.9)'
  ctx.fillText(`${data.openCount} OPEN`, cx2 - 60, iy)
  ctx.fillStyle = C.mid
  ctx.fillText(`${data.doneCount}/${data.totalCount} DONE`, cx2, iy)

  // Progress bar
  const bx = x + 12
  const by = iy + 12
  const bw = W - 24
  const bh = 3
  const pct = data.totalCount > 0 ? data.doneCount / data.totalCount : 0

  ctx.fillStyle = 'rgba(0, 255, 65, 0.12)'
  ctx.fillRect(bx, by, bw, bh)
  ctx.fillStyle = C.primary
  glow(ctx, 6)
  ctx.fillRect(bx, by, bw * pct, bh)
  noGlow(ctx)

  // Issue list
  const issues = data.issues.slice(0, 3)
  issues.forEach((issue: JiraIssue, i) => {
    const rowY = by + 14 + i * 22
    ctx.font         = `9px ${C.font}`
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'

    // Priority dot
    const dotColor = issue.priority === 'High' || issue.priority === 'Highest'
      ? 'rgba(255, 80, 80, 0.9)'
      : issue.priority === 'Medium'
        ? 'rgba(255, 180, 0, 0.9)'
        : C.dim
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(x + 18, rowY, 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = C.mid
    ctx.fillText(issue.key, x + 28, rowY)

    ctx.fillStyle = 'rgba(0, 255, 65, 0.65)'
    const summary = issue.summary.length > 34 ? issue.summary.slice(0, 34) + '…' : issue.summary
    ctx.fillText(summary, x + 28 + 56, rowY)

    ctx.fillStyle = C.dim
    ctx.textAlign = 'right'
    ctx.fillText(issue.status.toUpperCase(), x + W - 10, rowY)
  })

  ctx.restore()
}

// ─── Issues widget (expanded list) ───────────────────────────────────────────
function drawIssuesWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  issues: JiraIssue[],
  age: number,
) {
  const W = 290
  const H = 40 + issues.slice(0, 6).length * 24 + 12

  drawPanel(ctx, x, y, W, H, 'MY OPEN ISSUES', age)

  const progress = Math.min(1, age / 300)
  ctx.save()
  ctx.globalAlpha = progress
  ctx.translate((1 - progress) * -60, 0)

  if (issues.length === 0) {
    ctx.font      = `10px ${C.font}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'left'
    ctx.fillText('No open issues ✓', x + 12, y + 50)
    ctx.restore()
    return
  }

  issues.slice(0, 6).forEach((issue: JiraIssue, i) => {
    const rowY = y + 40 + i * 24

    // Alternating row bg
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(0, 255, 65, 0.03)'
      ctx.fillRect(x + 1, rowY - 10, W - 2, 22)
    }

    const dotColor = issue.priority === 'High' || issue.priority === 'Highest'
      ? 'rgba(255, 80, 80, 0.9)'
      : 'rgba(255, 180, 0, 0.8)'
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(x + 16, rowY + 1, 3.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.font         = `9px ${C.font}`
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = C.mid
    ctx.fillText(issue.key, x + 26, rowY + 2)

    ctx.fillStyle = 'rgba(0, 255, 65, 0.7)'
    const summary = issue.summary.length > 30 ? issue.summary.slice(0, 30) + '…' : issue.summary
    ctx.fillText(summary, x + 82, rowY + 2)

    ctx.textAlign = 'right'
    ctx.fillStyle = C.dim
    ctx.fillText(issue.status, x + W - 10, rowY + 2)
  })

  ctx.restore()
}

// ─── Gesture feedback ─────────────────────────────────────────────────────────
export function drawGestureFeedback(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  gestureLabel: string,
  age: number,
) {
  if (age > 1200) return
  const opacity = Math.max(0, 1 - age / 1200)

  ctx.font         = `11px ${C.font}`
  ctx.textAlign    = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle    = `rgba(0, 255, 65, ${opacity * 0.7})`
  ctx.shadowBlur   = 8 * opacity
  ctx.shadowColor  = C.glow
  ctx.fillText(`◈ ${gestureLabel.toUpperCase()}`, w - 30, h - 36)
  ctx.shadowBlur   = 0
}

// ─── Widget positions (anchored to left side by default) ─────────────────────
const WIDGET_POSITIONS: Record<WidgetId, { x: number; y: number }> = {
  sprint: { x: 24, y: 80  },
  issues: { x: 24, y: 310 },
  clock:  { x: 0,  y: 0   },  // drawn by RingLayer
  status: { x: 0,  y: 0   },  // drawn by RingLayer
}

// ─── Main draw call ───────────────────────────────────────────────────────────
export function drawWidgets(
  ctx: CanvasRenderingContext2D,
  activeWidgets: Set<WidgetId>,
  connectorData: Record<string, ConnectorData>,
  widgetBirthTimes: Map<WidgetId, number>,
  now: number,
) {
  const jiraData = connectorData['jira']?.data as { sprint?: SprintData; issues?: JiraIssue[] } | undefined

  if (activeWidgets.has('sprint')) {
    const born = widgetBirthTimes.get('sprint') ?? now
    drawSprintWidget(ctx, WIDGET_POSITIONS.sprint.x, WIDGET_POSITIONS.sprint.y, jiraData?.sprint ?? null, now - born)
  }

  if (activeWidgets.has('issues')) {
    const born = widgetBirthTimes.get('issues') ?? now
    drawIssuesWidget(ctx, WIDGET_POSITIONS.issues.x, WIDGET_POSITIONS.issues.y, jiraData?.issues ?? [], now - born)
  }
}
