// CIPHER — WidgetLayer
// Draws floating HUD data panels onto the canvas

import type {
  WidgetId,
  ConnectorData,
  SearchResult,
  NotificationItem,
  ActivityItem,
  DrillDownState,
  GitHubData,
  CalendarData,
  LinearData,
  LinearTicket,
} from '../../types'

const C = {
  primary:  'rgba(0, 255, 65, 0.85)',
  mid:      'rgba(0, 255, 65, 0.50)',
  dim:      'rgba(0, 255, 65, 0.25)',
  fill:     'rgba(0, 20, 0, 0.75)',
  font:     "'Courier New', Courier, monospace",
  glow:     '#00ff41',
}

const CYAN = {
  primary:  'rgba(0, 200, 255, 0.85)',
  mid:      'rgba(0, 200, 255, 0.50)',
  dim:      'rgba(0, 200, 255, 0.25)',
  fill:     'rgba(0, 8, 20, 0.78)',
  font:     "'Courier New', Courier, monospace",
  glow:     '#00c8ff',
}

const AMBER = {
  primary:  'rgba(255, 160, 0, 0.85)',
  mid:      'rgba(255, 160, 0, 0.50)',
  dim:      'rgba(255, 160, 0, 0.25)',
  fill:     'rgba(20, 12, 0, 0.78)',
  font:     "'Courier New', Courier, monospace",
  glow:     '#ffa000',
}

type ColorScheme = typeof C

function glow(ctx: CanvasRenderingContext2D, blur = 10, colors: ColorScheme = C) {
  ctx.shadowBlur  = blur
  ctx.shadowColor = colors.glow
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
  colors: ColorScheme = C,
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
  ctx.fillStyle = colors.fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 4)
  ctx.fill()

  // Border
  ctx.strokeStyle = colors.mid
  ctx.lineWidth   = 1
  glow(ctx, 8, colors)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, 4)
  ctx.stroke()
  noGlow(ctx)

  // Title bar
  const titleBarAlpha = colors === CYAN ? '0.06' : colors === AMBER ? '0.08' : '0.08'
  ctx.fillStyle = colors.primary.replace(/[\d.]+\)$/, `${titleBarAlpha})`)
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w - 2, 26, [3, 3, 0, 0])
  ctx.fill()

  // Title text
  ctx.font         = `11px ${colors.font}`
  ctx.fillStyle    = colors.primary
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'middle'
  glow(ctx, 10, colors)
  ctx.fillText(`▸ ${title}`, x + 10, y + 14)
  noGlow(ctx)

  // Title separator
  ctx.strokeStyle = colors.dim
  ctx.lineWidth   = 0.5
  ctx.beginPath()
  ctx.moveTo(x + 6, y + 27)
  ctx.lineTo(x + w - 6, y + 27)
  ctx.stroke()

  ctx.restore()
}

// ─── Entrance animation helper ───────────────────────────────────────────────
function applyEntrance(ctx: CanvasRenderingContext2D, age: number) {
  const progress = Math.min(1, age / 300)
  ctx.globalAlpha = progress
  ctx.translate((1 - progress) * -60, 0)
}

// ─── Clip to panel bounds (call after ctx.save + applyEntrance) ─────────────
function clipToPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
}

// ─── Relative time helper ────────────────────────────────────────────────────
function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  const sec  = Math.floor(diff / 1000)
  if (sec < 60)   return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60)   return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24)    return `${hr}h`
  const days = Math.floor(hr / 24)
  return `${days}d`
}

// ─── Linear Overview widget (replaces Sprint Status) ────────────────────────
function drawLinearOverviewWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  data: LinearData | null,
  age: number,
) {
  const W = 290

  // Count tickets by state
  const tickets = data?.assignedTickets ?? []
  const inProgress = tickets.filter(t => t.state.toLowerCase().includes('progress')).length
  const todo       = tickets.filter(t => t.state.toLowerCase().includes('todo') || t.state.toLowerCase() === 'backlog').length
  const inReview   = tickets.filter(t => t.state.toLowerCase().includes('review')).length
  const done       = tickets.filter(t => t.state.toLowerCase().includes('done') || t.state.toLowerCase().includes('complete')).length
  const total      = tickets.length

  const hasData = data !== null
  const H = hasData && total > 0 ? 40 + 20 + 4 * 18 + 22 + 12 : 80

  drawPanel(ctx, x, y, W, H, 'LINEAR OVERVIEW', age)

  ctx.save()
  applyEntrance(ctx, age)
  clipToPanel(ctx, x, y, W, H)

  if (!data) {
    ctx.font      = `10px ${C.font}`
    ctx.fillStyle = 'rgba(255, 160, 0, 0.5)'
    ctx.textAlign = 'left'
    ctx.fillText('NOT CONFIGURED', x + 12, y + 50)
    ctx.restore()
    return
  }

  if (total === 0) {
    ctx.font      = `10px ${C.font}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'left'
    ctx.fillText('No tickets assigned', x + 12, y + 50)
    ctx.restore()
    return
  }

  let curY = y + 36

  // Project name
  ctx.font         = `12px ${C.font}`
  ctx.fillStyle    = C.primary
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'middle'
  glow(ctx, 8)
  ctx.fillText((data.projectName || 'LINEAR').toUpperCase(), x + 12, curY)
  noGlow(ctx)

  // Total count
  ctx.textAlign = 'right'
  ctx.font      = `10px ${C.font}`
  ctx.fillStyle = C.mid
  ctx.fillText(`${total} ASSIGNED`, x + W - 12, curY)

  curY += 20

  // Breakdown by state
  const states: Array<{ label: string; count: number; color: string }> = [
    { label: 'IN PROGRESS', count: inProgress, color: 'rgba(0, 200, 255, 0.9)' },
    { label: 'TODO',        count: todo,       color: 'rgba(255, 180, 0, 0.9)' },
    { label: 'IN REVIEW',   count: inReview,   color: 'rgba(180, 120, 255, 0.9)' },
    { label: 'DONE',        count: done,        color: C.primary },
  ]

  states.forEach(s => {
    ctx.font      = `9px ${C.font}`
    ctx.textAlign = 'left'
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.arc(x + 18, curY, 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = C.mid
    ctx.fillText(s.label, x + 28, curY + 1)

    ctx.textAlign = 'right'
    ctx.fillStyle = s.count > 0 ? s.color : C.dim
    ctx.fillText(String(s.count), x + W - 12, curY + 1)

    curY += 18
  })

  // Progress bar (done vs total)
  const bx  = x + 12
  const bw  = W - 24
  const bh  = 3
  const pct = total > 0 ? done / total : 0

  ctx.fillStyle = 'rgba(0, 255, 65, 0.12)'
  ctx.fillRect(bx, curY + 4, bw, bh)
  ctx.fillStyle = C.primary
  glow(ctx, 6)
  ctx.fillRect(bx, curY + 4, bw * pct, bh)
  noGlow(ctx)

  ctx.restore()
}

// ─── GitHub Activity widget ──────────────────────────────────────────────────
function drawGitHubWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  data: GitHubData | null,
  age: number,
) {
  const W = 290
  const prs         = data?.openPRs?.slice(0, 3) ?? []
  const reviews     = data?.reviewRequested?.slice(0, 2) ?? []
  const ghIssues    = data?.assignedIssues?.slice(0, 2) ?? []
  const hasContent  = prs.length > 0 || reviews.length > 0 || ghIssues.length > 0

  // Dynamic height: title(28) + sections
  let contentH = 0
  if (!data || !hasContent) {
    contentH = 30
  } else {
    if (prs.length > 0)     contentH += 16 + prs.length * 18
    if (reviews.length > 0) contentH += 16 + reviews.length * 18
    if (ghIssues.length > 0) contentH += 16 + ghIssues.length * 18
  }
  const H = 32 + contentH + 8

  drawPanel(ctx, x, y, W, H, 'GITHUB ACTIVITY', age, CYAN)

  ctx.save()
  applyEntrance(ctx, age)
  clipToPanel(ctx, x, y, W, H)

  if (!data) {
    ctx.font      = `10px ${CYAN.font}`
    ctx.fillStyle = 'rgba(255, 160, 0, 0.5)'
    ctx.textAlign = 'left'
    ctx.fillText('NOT CONFIGURED', x + 12, y + 50)
    ctx.restore()
    return
  }

  if (!hasContent) {
    ctx.font      = `10px ${CYAN.font}`
    ctx.fillStyle = CYAN.dim
    ctx.textAlign = 'left'
    ctx.fillText('NO ACTIVITY', x + 12, y + 50)
    ctx.restore()
    return
  }

  let curY = y + 36

  // --- OPEN PRs ---
  if (prs.length > 0) {
    ctx.font      = `7px ${CYAN.font}`
    ctx.fillStyle = CYAN.dim
    ctx.textAlign = 'left'
    ctx.fillText('OPEN PRs', x + 12, curY)
    curY += 14

    prs.forEach(pr => {
      // Green dot
      ctx.fillStyle = 'rgba(0, 255, 65, 0.85)'
      ctx.beginPath()
      ctx.arc(x + 16, curY, 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.font      = `9px ${CYAN.font}`
      ctx.fillStyle = CYAN.primary
      ctx.textAlign = 'left'
      const label = `#${pr.number} ${pr.title}`.slice(0, 28)
      ctx.fillText(label, x + 24, curY + 1)
      curY += 18
    })
  }

  // --- REVIEW REQUESTS ---
  if (reviews.length > 0) {
    ctx.font      = `7px ${CYAN.font}`
    ctx.fillStyle = CYAN.dim
    ctx.textAlign = 'left'
    ctx.fillText('REVIEW REQUESTS', x + 12, curY)
    curY += 14

    reviews.forEach(pr => {
      // Orange dot
      ctx.fillStyle = 'rgba(255, 160, 0, 0.85)'
      ctx.beginPath()
      ctx.arc(x + 16, curY, 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.font      = `9px ${CYAN.font}`
      ctx.fillStyle = CYAN.mid
      ctx.textAlign = 'left'
      const label = `#${pr.number} ${pr.title}`.slice(0, 28)
      ctx.fillText(label, x + 24, curY + 1)
      curY += 18
    })
  }

  // --- ISSUES ---
  if (ghIssues.length > 0) {
    ctx.font      = `7px ${CYAN.font}`
    ctx.fillStyle = CYAN.dim
    ctx.textAlign = 'left'
    ctx.fillText('ISSUES', x + 12, curY)
    curY += 14

    ghIssues.forEach(issue => {
      ctx.fillStyle = CYAN.dim
      ctx.beginPath()
      ctx.arc(x + 16, curY, 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.font      = `9px ${CYAN.font}`
      ctx.fillStyle = CYAN.mid
      ctx.textAlign = 'left'
      const label = `#${issue.number} ${issue.title}`.slice(0, 28)
      ctx.fillText(label, x + 24, curY + 1)
      curY += 18
    })
  }

  ctx.restore()
}

// ─── Calendar widget ─────────────────────────────────────────────────────────
function drawCalendarWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  data: CalendarData | null,
  age: number,
) {
  const W = 290
  const todayEvents = data?.todayEvents?.slice(0, 4) ?? []
  const nextEvent   = data?.nextEvent ?? null

  let contentH = 0
  if (!data) {
    contentH = 30
  } else {
    if (nextEvent) contentH += 38
    contentH += 16 + Math.max(todayEvents.length, 1) * 18
  }
  const H = 32 + contentH + 8

  drawPanel(ctx, x, y, W, H, 'CALENDAR', age, CYAN)

  ctx.save()
  applyEntrance(ctx, age)
  clipToPanel(ctx, x, y, W, H)

  if (!data) {
    ctx.font      = `10px ${CYAN.font}`
    ctx.fillStyle = CYAN.dim
    ctx.textAlign = 'left'
    ctx.fillText('NO EVENTS TODAY', x + 12, y + 50)
    ctx.restore()
    return
  }

  let curY = y + 36

  // --- NEXT event ---
  if (nextEvent) {
    ctx.font      = `7px ${CYAN.font}`
    ctx.fillStyle = CYAN.dim
    ctx.textAlign = 'left'
    ctx.fillText('NEXT', x + 12, curY)
    curY += 13

    ctx.font      = `10px ${CYAN.font}`
    ctx.fillStyle = CYAN.primary
    glow(ctx, 6, CYAN)
    const title = nextEvent.title.length > 28 ? nextEvent.title.slice(0, 28) + '…' : nextEvent.title
    ctx.fillText(title, x + 12, curY)
    noGlow(ctx)

    // Time-until
    const startMs = new Date(nextEvent.start).getTime()
    const diffMin = Math.max(0, Math.floor((startMs - Date.now()) / 60000))
    const timeStr = diffMin < 60 ? `in ${diffMin}m` : `in ${Math.floor(diffMin / 60)}h${diffMin % 60}m`
    ctx.textAlign = 'right'
    ctx.fillStyle = CYAN.mid
    ctx.font      = `9px ${CYAN.font}`
    ctx.fillText(timeStr, x + W - 12, curY)

    // MEET badge
    if (nextEvent.meetUrl) {
      ctx.textAlign = 'right'
      ctx.font      = `bold 8px ${CYAN.font}`
      ctx.fillStyle = CYAN.primary
      glow(ctx, 8, CYAN)
      ctx.fillText('MEET', x + W - 12, curY + 14)
      noGlow(ctx)
    }

    curY += 24
  }

  // --- TODAY section ---
  ctx.font      = `7px ${CYAN.font}`
  ctx.fillStyle = CYAN.dim
  ctx.textAlign = 'left'
  ctx.fillText('TODAY', x + 12, curY)
  curY += 14

  if (todayEvents.length === 0) {
    ctx.font      = `9px ${CYAN.font}`
    ctx.fillStyle = CYAN.dim
    ctx.fillText('NO EVENTS TODAY', x + 12, curY)
  } else {
    todayEvents.forEach(evt => {
      const start = new Date(evt.start)
      const hh    = String(start.getHours()).padStart(2, '0')
      const mm    = String(start.getMinutes()).padStart(2, '0')

      ctx.font      = `9px ${CYAN.font}`
      ctx.fillStyle = CYAN.dim
      ctx.textAlign = 'left'
      ctx.fillText(`${hh}:${mm}`, x + 12, curY)

      ctx.fillStyle = CYAN.mid
      const title = evt.title.length > 24 ? evt.title.slice(0, 24) + '…' : evt.title
      ctx.fillText(title, x + 52, curY)

      curY += 18
    })
  }

  ctx.restore()
}

// ─── Linear Assigned Tickets widget ─────────────────────────────────────────
export function drawLinearAssignedWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  data: LinearData | null,
  age: number,
) {
  const W = 290
  const tickets = data?.assignedTickets?.slice(0, 6) ?? []

  const contentH = !data ? 30 : Math.max(tickets.length, 1) * 20 + (data?.isMock ? 16 : 0)
  const H = 32 + contentH + 12

  drawPanel(ctx, x, y, W, H, 'MY TICKETS', age)

  ctx.save()
  applyEntrance(ctx, age)
  clipToPanel(ctx, x, y, W, H)

  if (!data) {
    ctx.font      = `10px ${C.font}`
    ctx.fillStyle = 'rgba(255, 160, 0, 0.5)'
    ctx.textAlign = 'left'
    ctx.fillText('NOT CONFIGURED', x + 12, y + 50)
    ctx.restore()
    return
  }

  if (tickets.length === 0) {
    ctx.font      = `10px ${C.font}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'left'
    ctx.fillText('No tickets assigned', x + 12, y + 50)
    ctx.restore()
    return
  }

  let curY = y + 38

  tickets.forEach(ticket => {
    // Priority dot: 1=red, 2=orange, 3+=dim
    const dotColor = ticket.priority === 1
      ? 'rgba(255, 80, 80, 0.9)'
      : ticket.priority === 2
        ? 'rgba(255, 160, 0, 0.9)'
        : C.dim
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(x + 16, curY, 3, 0, Math.PI * 2)
    ctx.fill()

    // Identifier
    ctx.font      = `9px ${C.font}`
    ctx.textAlign = 'left'
    ctx.fillStyle = C.mid
    ctx.fillText(ticket.identifier, x + 24, curY + 1)

    // Title (truncated)
    ctx.fillStyle = 'rgba(0, 255, 65, 0.65)'
    const title = ticket.title.length > 22 ? ticket.title.slice(0, 22) + '…' : ticket.title
    ctx.fillText(title, x + 76, curY + 1)

    // State (right-aligned)
    ctx.textAlign = 'right'
    ctx.fillStyle = C.dim
    ctx.fillText(ticket.state.toUpperCase(), x + W - 10, curY + 1)

    curY += 20
  })

  // Mock indicator
  if (data.isMock) {
    ctx.font      = `8px ${C.font}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'right'
    ctx.fillText('MOCK', x + W - 10, y + H - 8)
  }

  ctx.restore()
}

// ─── Notifications widget ───────────────────────────────────────────────────
function drawNotificationsWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  notifications: NotificationItem[],
  age: number,
) {
  const W = 290
  const items = notifications.slice(0, 5)
  const unread = notifications.filter(n => n.priority === 'high').length

  const contentH = items.length > 0 ? items.length * 20 : 24
  const H = 32 + contentH + 12

  const titleStr = unread > 0 ? `NOTIFICATIONS (${unread})` : 'NOTIFICATIONS'
  drawPanel(ctx, x, y, W, H, titleStr, age, AMBER)

  ctx.save()
  applyEntrance(ctx, age)
  clipToPanel(ctx, x, y, W, H)

  if (items.length === 0) {
    ctx.font      = `10px ${AMBER.font}`
    ctx.fillStyle = AMBER.dim
    ctx.textAlign = 'left'
    ctx.fillText('ALL CLEAR', x + 12, y + 50)
    ctx.restore()
    return
  }

  const now = Date.now()
  let curY = y + 38

  items.forEach(item => {
    // Source label (4 chars, dim)
    const sourceMap: Record<string, string> = { slack: 'SLCK', gmail: 'MAIL', github: 'GH  ' }
    const srcLabel = (sourceMap[item.source] ?? item.source.slice(0, 4).toUpperCase()).padEnd(4, ' ')

    ctx.font      = `8px ${AMBER.font}`
    ctx.fillStyle = AMBER.dim
    ctx.textAlign = 'left'
    ctx.fillText(srcLabel, x + 12, curY + 1)

    // Text (truncated) — pulse glow for items < 10s old
    const itemAge = now - item.timestamp
    const isNew = itemAge < 10000
    ctx.font      = `9px ${AMBER.font}`
    if (isNew) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300)
      ctx.fillStyle = `rgba(255, 160, 0, ${0.7 + pulse * 0.3})`
      glow(ctx, 6, AMBER)
    } else {
      ctx.fillStyle = item.priority === 'high' ? AMBER.primary : AMBER.mid
    }
    const text = item.text.length > 32 ? item.text.slice(0, 32) + '…' : item.text
    ctx.fillText(text, x + 46, curY + 1)
    if (isNew) noGlow(ctx)

    // Relative time
    ctx.textAlign = 'right'
    ctx.fillStyle = AMBER.dim
    ctx.font      = `8px ${AMBER.font}`
    ctx.fillText(relativeTime(item.timestamp, now), x + W - 10, curY + 1)

    curY += 20
  })

  ctx.restore()
}

// ─── Activity Feed widget ───────────────────────────────────────────────────
function drawActivityFeedWidget(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  activityFeed: ActivityItem[],
  age: number,
) {
  const W = 290
  const items = activityFeed.slice(0, 6)
  const contentH = items.length > 0 ? items.length * 20 : 24
  const H = 32 + contentH + 12

  drawPanel(ctx, x, y, W, H, 'GMAIL FEED', age)

  ctx.save()
  applyEntrance(ctx, age)
  clipToPanel(ctx, x, y, W, H)

  if (items.length === 0) {
    ctx.font      = `10px ${C.font}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'left'
    ctx.fillText('No recent emails', x + 12, y + 54)
    ctx.restore()
    return
  }

  const now = Date.now()
  let curY = y + 38

  items.forEach((item, i) => {
    const fadeAlpha = Math.max(0.3, 1 - i * 0.12)
    ctx.globalAlpha = Math.min(1, age / 300) * fadeAlpha

    // Relative time (left)
    const timeStr = relativeTime(item.timestamp, now)
    ctx.font      = `8px ${C.font}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'left'
    ctx.fillText(timeStr.padEnd(4, ' '), x + 12, curY)

    // Email text — vertical list, one per row
    const itemAge = now - item.timestamp
    ctx.font      = `9px ${C.font}`
    ctx.fillStyle = itemAge < 30000 ? C.primary : C.mid
    const text = item.text.length > 32 ? item.text.slice(0, 32) + '\u2026' : item.text
    ctx.fillText(text, x + 46, curY)

    curY += 20
  })

  ctx.restore()
}

// ─── Mini Metrics (raw text, no panel) ──────────────────────────────────────
export function drawMiniMetrics(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  bootTime: number,
  age: number,
) {
  const progress = Math.min(1, age / 300)
  ctx.save()
  ctx.globalAlpha = progress

  const upMs   = Date.now() - bootTime
  const upMin  = Math.floor(upMs / 60000)
  const upHrs  = Math.floor(upMin / 60)
  const remMin = upMin % 60

  ctx.font      = `9px ${C.font}`
  ctx.fillStyle = C.dim
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`UP ${upHrs}h${remMin}m  |  CIPHER v1.0`, x, y)

  ctx.restore()
}


// ─── Iron Man: Face scan ring ─────────────────────────────────────────────────
// Draws an ellipse around the face area with a rotating sweep arc (loading)
// or corner lock-on brackets (result ready). Iron Man ID style.
export function drawFaceScanRing(
  ctx: CanvasRenderingContext2D,
  t: number,       // performance.now()
  loading: boolean,
  lockAge: number, // ms since result arrived (0 while loading)
) {
  const cx = 640, cy = 220, rx = 158, ry = 188

  ctx.save()

  // Base ellipse outline
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.strokeStyle = loading ? 'rgba(0, 200, 255, 0.25)' : 'rgba(0, 255, 65, 0.18)'
  ctx.lineWidth   = 1
  ctx.stroke()

  if (loading) {
    // Two counter-rotating arcs — scanning sweep
    const angle  = (t / 900) % (Math.PI * 2)
    const arcLen = Math.PI * 0.45

    ctx.shadowBlur  = 14
    ctx.shadowColor = 'rgba(0, 200, 255, 0.8)'
    ctx.lineWidth   = 2

    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, angle, angle + arcLen)
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.95)'
    ctx.stroke()

    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, 0, -angle + Math.PI, -angle + Math.PI + arcLen * 0.6)
    ctx.strokeStyle = 'rgba(0, 200, 255, 0.45)'
    ctx.lineWidth   = 1
    ctx.stroke()

    ctx.shadowBlur = 0

    // SCANNING label above ellipse
    const dots = '.'.repeat(1 + Math.floor(t / 280) % 4)
    ctx.font         = `11px ${C.font}`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle    = 'rgba(0, 200, 255, 0.85)'
    ctx.shadowBlur   = 8
    ctx.shadowColor  = 'rgba(0,200,255,0.6)'
    ctx.fillText(`[ SCANNING${dots} ]`, cx, cy - ry - 10)
    ctx.shadowBlur   = 0

  } else {
    // Lock-on brackets at N / E / S / W of the ellipse
    const bLen  = 14
    const flash = Math.max(0, 1 - lockAge / 350)
    const aBase = 0.55 + flash * 0.45

    ctx.strokeStyle = `rgba(0, 255, 65, ${aBase})`
    ctx.lineWidth   = 1.5
    ctx.shadowBlur  = flash > 0.05 ? 16 : 5
    ctx.shadowColor = C.glow

    const brackets = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]
    brackets.forEach(angle => {
      const px  = cx + rx * Math.cos(angle)
      const py  = cy + ry * Math.sin(angle)
      const nx  = Math.cos(angle)   // outward normal
      const ny  = Math.sin(angle)
      const tx  = -ny               // tangent
      const ty  = nx

      ctx.beginPath()
      ctx.moveTo(px + tx * bLen, py + ty * bLen)
      ctx.lineTo(px,             py)
      ctx.lineTo(px - nx * bLen, py - ny * bLen)
      ctx.stroke()
    })
    ctx.shadowBlur = 0

    // IDENTIFIED label
    const idA = Math.min(1, lockAge / 220)
    ctx.font         = `11px ${C.font}`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle    = `rgba(0, 255, 65, ${idA * 0.85})`
    ctx.shadowBlur   = idA > 0.1 ? 8 : 0
    ctx.shadowColor  = C.glow
    ctx.fillText('[ IDENTIFIED ]', cx, cy - ry - 10)
    ctx.shadowBlur   = 0
  }

  ctx.restore()
}

// ─── Iron Man: Intel card (face-overlay popup) ────────────────────────────────
// Floating holographic card centered over the face — replaces the side panel.
// Shows bullet points with a typewriter reveal. Auto-fades after 7 s.
export function drawIntelCard(
  ctx: CanvasRenderingContext2D,
  W: number, _H: number,
  query: string | null,
  result: SearchResult | null,
  loading: boolean,
  age: number,  // ms since card appeared
) {
  if (!loading && !result) return

  const CW      = 340
  const cardX   = W / 2 - CW / 2   // 470 for W=1280
  const cardY   = 390

  // Fade in / fade-out envelope
  const FADE_IN       = 380
  const FADE_OUT_START = 6200
  const FADE_OUT_END   = 7000

  let alpha = 1
  if (age < FADE_IN)              alpha = age / FADE_IN
  else if (age > FADE_OUT_START)  alpha = Math.max(0, 1 - (age - FADE_OUT_START) / (FADE_OUT_END - FADE_OUT_START))
  if (alpha <= 0) return

  const bullets = result?.bullets ?? []
  const CH = 36 + 22 + (loading ? 22 : bullets.length * 23 + 12) + 16

  ctx.save()
  ctx.globalAlpha = alpha

  // Background — dark with a subtle cyan tint (Iron Man palette)
  ctx.fillStyle = 'rgba(0, 8, 20, 0.88)'
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, CW, CH, 3)
  ctx.fill()

  // Border glow (cyan)
  ctx.strokeStyle = 'rgba(0, 200, 255, 0.65)'
  ctx.lineWidth   = 1
  ctx.shadowBlur  = 14
  ctx.shadowColor = 'rgba(0, 200, 255, 0.5)'
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, CW, CH, 3)
  ctx.stroke()
  ctx.shadowBlur = 0

  // Corner tick marks (Iron Man lock-on style)
  const tLen = 10, tGap = 2
  const corners: Array<[number, number, number, number]> = [
    [cardX,      cardY,      1,  1],
    [cardX + CW, cardY,     -1,  1],
    [cardX,      cardY + CH, 1, -1],
    [cardX + CW, cardY + CH,-1, -1],
  ]
  ctx.strokeStyle = 'rgba(0, 220, 255, 0.9)'
  ctx.lineWidth   = 1.5
  ctx.shadowBlur  = 6
  ctx.shadowColor = 'rgba(0,220,255,0.7)'
  corners.forEach(([x, y, dx, dy]) => {
    ctx.beginPath()
    ctx.moveTo(x + dx * tGap, y + dy * (tGap + tLen))
    ctx.lineTo(x + dx * tGap, y + dy * tGap)
    ctx.lineTo(x + dx * (tGap + tLen), y + dy * tGap)
    ctx.stroke()
  })
  ctx.shadowBlur = 0

  const cx = W / 2

  // Header
  const header = loading ? '[ SCANNING ]' : '[ INTEL ACQUIRED ]'
  ctx.font         = `bold 10px ${C.font}`
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle    = loading ? 'rgba(0, 200, 255, 0.92)' : 'rgba(0, 255, 65, 0.95)'
  ctx.shadowBlur   = 10
  ctx.shadowColor  = loading ? 'rgba(0,200,255,0.7)' : C.glow
  ctx.fillText(header, cx, cardY + 17)
  ctx.shadowBlur   = 0

  // Separator
  ctx.strokeStyle = loading ? 'rgba(0,200,255,0.18)' : 'rgba(0,255,65,0.15)'
  ctx.lineWidth   = 0.5
  ctx.beginPath()
  ctx.moveTo(cardX + 10, cardY + 29)
  ctx.lineTo(cardX + CW - 10, cardY + 29)
  ctx.stroke()

  // Title / query label
  const titleText = result
    ? result.title.toUpperCase().slice(0, 38)
    : (query ?? '').toUpperCase().slice(0, 38)
  if (titleText) {
    ctx.font         = `11px ${C.font}`
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = 'rgba(0, 255, 200, 0.9)'
    ctx.shadowBlur   = 8
    ctx.shadowColor  = 'rgba(0,255,200,0.5)'
    ctx.fillText(titleText, cardX + 14, cardY + 44)
    ctx.shadowBlur   = 0
  }

  const contentY = cardY + 62

  if (loading) {
    const dots = '.'.repeat(1 + Math.floor(Date.now() / 300) % 4)
    ctx.font         = `9px ${C.font}`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle    = 'rgba(0, 200, 255, 0.7)'
    ctx.fillText(`ACCESSING DATABASE${dots}`, cx, contentY)
  } else if (bullets.length > 0) {
    // Typewriter effect — 18 ms per character, starts after 300 ms
    const charsShown = Math.max(0, Math.floor((age - 300) / 18))
    let charCount = 0

    bullets.forEach((bullet, i) => {
      const rowY = contentY + i * 23

      // Diamond bullet marker
      ctx.font      = `9px ${C.font}`
      ctx.textAlign = 'left'
      ctx.fillStyle = 'rgba(0, 220, 255, 0.75)'
      ctx.fillText('◆', cardX + 13, rowY)

      if (charCount < charsShown) {
        const visible = bullet.slice(0, charsShown - charCount)
        ctx.fillStyle = 'rgba(0, 255, 65, 0.88)'
        ctx.fillText(visible, cardX + 26, rowY)

        // Blinking cursor on active line
        if (visible.length < bullet.length) {
          const tw = ctx.measureText(visible).width
          if (Math.floor(Date.now() / 420) % 2 === 0) {
            ctx.fillStyle = 'rgba(0, 220, 255, 0.9)'
            ctx.fillText('▌', cardX + 26 + tw, rowY)
          }
        }
      }
      charCount += bullet.length
    })

    // Source credit (fades in after all bullets appear)
    if (age > 500) {
      const srcA = Math.min(1, (age - 500) / 500)
      ctx.font         = `8px ${C.font}`
      ctx.textAlign    = 'right'
      ctx.textBaseline = 'bottom'
      ctx.fillStyle    = `rgba(0,255,65,${srcA * 0.28})`
      ctx.fillText(`SRC: ${(result?.source ?? '').toUpperCase()}`, cardX + CW - 12, cardY + CH - 5)
    }
  }

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

// ─── Widget bounding boxes (exported for hit-testing in GestureEngine) ───────
export const WIDGET_BOUNDS: Record<string, { x: number; y: number; w: number; h: number }> = {
  sprint:        { x: 24,  y: 80,  w: 290, h: 160 },
  github:        { x: 966, y: 80,  w: 290, h: 200 },
  calendar:      { x: 966, y: 240, w: 290, h: 160 },
  notifications: { x: 966, y: 400, w: 290, h: 140 },
  activity:      { x: 24,  y: 260, w: 290, h: 140 },
}

// ─── Widget positions (anchored to left side by default) ─────────────────────
const WIDGET_POSITIONS: Record<WidgetId, { x: number; y: number }> = {
  sprint:        { x: 24,  y: 80  },
  issues:        { x: 24,  y: 240 },  // kept for WidgetId compat, not rendered
  github:        { x: 966, y: 80  },
  calendar:      { x: 966, y: 240 },
  notifications: { x: 966, y: 400 },
  activity:      { x: 24,  y: 260 },  // below sprint with 20px gap
  metrics:       { x: 966, y: 600 },
  clock:         { x: 0,   y: 0   },  // drawn by RingLayer
  status:        { x: 0,   y: 0   },  // drawn by RingLayer
  search:        { x: 960, y: 80  },  // right-side panel
}

// ─── Transcript Panel ────────────────────────────────────────────────────────
function drawTranscriptPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  text: string,
  systemText: string,
  age: number,
) {
  const W = 260
  const H = systemText ? 110 : 90
  const progress = Math.min(1, age / 300)
  const eased    = 1 - Math.pow(1 - progress, 3)

  ctx.save()
  ctx.globalAlpha = eased
  ctx.translate((1 - eased) * -40, 0)

  // Background
  ctx.fillStyle = 'rgba(0, 20, 10, 0.90)'
  ctx.beginPath()
  ctx.roundRect(x, y, W, H, 4)
  ctx.fill()

  // Border
  ctx.strokeStyle = C.primary
  ctx.lineWidth   = 1
  glow(ctx, 12)
  ctx.beginPath()
  ctx.roundRect(x, y, W, H, 4)
  ctx.stroke()
  noGlow(ctx)

  // Corner brackets
  const b = 8
  ctx.strokeStyle = C.primary
  ctx.lineWidth = 2
  glow(ctx, 6)
  // top-left
  ctx.beginPath(); ctx.moveTo(x, y + b); ctx.lineTo(x, y); ctx.lineTo(x + b, y); ctx.stroke()
  // top-right
  ctx.beginPath(); ctx.moveTo(x + W - b, y); ctx.lineTo(x + W, y); ctx.lineTo(x + W, y + b); ctx.stroke()
  // bottom-left
  ctx.beginPath(); ctx.moveTo(x, y + H - b); ctx.lineTo(x, y + H); ctx.lineTo(x + b, y + H); ctx.stroke()
  // bottom-right
  ctx.beginPath(); ctx.moveTo(x + W - b, y + H); ctx.lineTo(x + W, y + H); ctx.lineTo(x + W, y + H - b); ctx.stroke()
  noGlow(ctx)

  // Title row
  ctx.font         = `9px ${C.font}`
  ctx.textBaseline = 'middle'
  ctx.fillStyle    = C.primary
  ctx.textAlign    = 'left'
  glow(ctx, 8)
  ctx.fillText('◈ INTERACTIVE', x + 10, y + 14)
  noGlow(ctx)

  // REC indicator (blinking)
  const recOn = Math.floor(Date.now() / 600) % 2 === 0
  ctx.fillStyle = recOn ? C.primary : C.dim
  ctx.textAlign = 'right'
  glow(ctx, recOn ? 8 : 0)
  ctx.fillText('● DEEPGRAM', x + W - 10, y + 14)
  noGlow(ctx)

  // Separator
  ctx.strokeStyle = C.dim
  ctx.lineWidth   = 0.5
  ctx.beginPath()
  ctx.moveTo(x + 6, y + 25); ctx.lineTo(x + W - 6, y + 25)
  ctx.stroke()

  // Transcript text (word-wrapped to fit, last segment shown)
  ctx.font         = `10px ${C.font}`
  ctx.fillStyle    = 'rgba(128, 255, 176, 0.9)'
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'
  const display = text.slice(-80)  // show last 80 chars
  ctx.fillText(display, x + 10, y + 34, W - 20)

  // Blinking cursor
  const cursorOn = Math.floor(Date.now() / 500) % 2 === 0
  if (cursorOn) {
    const textW = Math.min(ctx.measureText(display).width, W - 20)
    ctx.fillStyle = C.primary
    ctx.fillRect(x + 10 + textW + 2, y + 34, 6, 11)
  }

  // System response (cyan, below user text)
  if (systemText) {
    ctx.font         = `10px ${C.font}`
    ctx.fillStyle    = 'rgba(0, 200, 255, 0.85)'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'top'
    const sysDisplay = systemText.slice(-80)
    glow(ctx, 6)
    ctx.fillText(`▸ ${sysDisplay}`, x + 10, y + 52, W - 20)
    noGlow(ctx)
  }

  // Footer hint
  ctx.font      = `8px ${C.font}`
  ctx.fillStyle = C.dim
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText('ROCK ON TO CLOSE · FIST TO CLEAR ALL', x + 10, y + H - 6)

  ctx.restore()
}

// ─── Word wrap for canvas text ──────────────────────────────────────────────
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

// ─── In-panel drill-down: replaces panel content with full item detail ──────
function drawDrillDownContent(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, W: number,
  drillDown: DrillDownState,
  colorScheme: typeof C,
) {
  const padding = 10
  const textMaxW = W - padding * 2

  // Reset text alignment (may be 'right' from previous draw calls)
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'top'

  // Title (word-wrapped, same 9px font as normal panel text)
  ctx.font = `9px ${colorScheme.font}`
  ctx.fillStyle = colorScheme.primary
  const titleLines = wrapText(ctx, drillDown.title, textMaxW)
  let curY = y + 38
  for (const line of titleLines) {
    ctx.fillText(line, x + padding, curY)
    curY += 14
  }

  // Body (word-wrapped)
  if (drillDown.body) {
    curY += 4
    ctx.font = `9px ${colorScheme.font}`
    ctx.fillStyle = colorScheme.mid
    const bodyLines = wrapText(ctx, drillDown.body, textMaxW)
    for (const line of bodyLines.slice(0, 12)) { // max 12 lines
      ctx.fillText(line, x + padding, curY)
      curY += 14
    }
  }

  // Timestamp
  curY += 8
  const timeStr = relativeTime(drillDown.timestamp, Date.now())
  ctx.font = `8px ${colorScheme.font}`
  ctx.fillStyle = colorScheme.dim
  ctx.fillText(timeStr, x + padding, curY)
}

// ─── Back button rendered at bottom of focused panel ────────────────────────
// Returns the Y zone (in canvas-space at 2× scale) for hit-testing
function drawBackButton(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, W: number, H: number,
  colorScheme: typeof C,
) {
  const btnY = y + H - 22
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `9px ${colorScheme.font}`
  ctx.fillStyle = colorScheme.primary
  ctx.strokeStyle = colorScheme.primary
  ctx.lineWidth = 0.5

  // Separator line
  ctx.beginPath()
  ctx.moveTo(x + 8, btnY - 4)
  ctx.lineTo(x + W - 8, btnY - 4)
  ctx.stroke()

  // Back label
  ctx.fillText('\u25C2 BACK', x + 10, btnY + 8)
}

// ─── Draw filtered Linear tickets (reused for sprint drill-down) ────────────
function drawFilteredTickets(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, _W: number,
  tickets: LinearTicket[],
  statusFilter: string,
) {
  const filtered = tickets.filter(t => t.state.toLowerCase().includes(statusFilter.toLowerCase()))
  const label = statusFilter.toUpperCase()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `bold 9px ${C.font}`
  ctx.fillStyle = C.primary
  ctx.fillText(`\u25B8 ${label} (${filtered.length})`, x + 10, y + 38)

  let curY = y + 56
  for (const ticket of filtered.slice(0, 8)) {
    // Priority dot
    ctx.fillStyle = ticket.priority <= 1 ? 'rgba(255, 80, 80, 0.9)' : ticket.priority <= 2 ? 'rgba(255, 160, 0, 0.9)' : C.dim
    ctx.beginPath()
    ctx.arc(x + 16, curY - 2, 3, 0, Math.PI * 2)
    ctx.fill()

    // Identifier
    ctx.font = `9px ${C.font}`
    ctx.fillStyle = C.mid
    ctx.fillText(ticket.identifier, x + 24, curY)

    // Title (full, word-wrapped if needed)
    ctx.fillStyle = 'rgba(0, 255, 65, 0.65)'
    const title = ticket.title.length > 28 ? ticket.title.slice(0, 28) + '\u2026' : ticket.title
    ctx.fillText(title, x + 76, curY)

    curY += 18
  }
}

// ─── Get hovered item index in focused panel ───────────────────────────────
export function getHoveredItemIndex(
  focusedWidget: WidgetId,
  fingerTip: { x: number; y: number },
): number {
  const bounds = WIDGET_BOUNDS[focusedWidget]
  if (!bounds) return -1
  const centre = getFocusCentre(focusedWidget)
  const panelTopY = centre.y * 2 + 38 * 2
  const rowHeight = focusedWidget === 'activity' ? 22 * 2 : 20 * 2
  const maxItems = focusedWidget === 'notifications' ? 5 : focusedWidget === 'activity' ? 6 : 5
  const panelLeftX = centre.x * 2
  const panelRightX = panelLeftX + bounds.w * 2

  if (fingerTip.x < panelLeftX || fingerTip.x > panelRightX) return -1
  const rowIdx = Math.floor((fingerTip.y - panelTopY) / rowHeight)
  return (rowIdx >= 0 && rowIdx < maxItems) ? rowIdx : -1
}

// ─── Dwell-to-select state (module-level, persists across frames) ───────────
const DWELL_MS = 1500  // 1.5 seconds to select
let dwellRowIdx = -1
let dwellStartTime = 0
let dwellFired = false  // prevent re-firing until row changes

/** Returns the row index that just completed dwell selection, or -1 */
export function consumeDwellSelection(): number {
  if (dwellFired) {
    dwellFired = false
    return dwellRowIdx
  }
  return -1
}

/** Reset dwell state (call when exiting focus mode) */
export function resetDwell() {
  dwellRowIdx = -1
  dwellStartTime = 0
  dwellFired = false
}

// ─── Focus mode: centred position for a widget at 2× scale ─────────────────
function getFocusCentre(widgetId: WidgetId): { x: number; y: number } {
  const bounds = WIDGET_BOUNDS[widgetId]
  if (!bounds) return { x: 320, y: 180 }
  // At 2× scale the panel occupies bounds.w*2 × bounds.h*2
  // We position so the panel (drawn at native size inside a scale(2) transform) is centred
  const cx = (1280 - bounds.w * 2) / 2
  const cy = (720 - bounds.h * 2) / 2
  // Divide by 2 because ctx.scale(2,2) doubles the coordinates
  return { x: cx / 2, y: cy / 2 }
}

// ─── Main draw call (search handled separately as Intel Card in HUDCanvas) ────
export function drawWidgets(
  ctx: CanvasRenderingContext2D,
  activeWidgets: Set<WidgetId>,
  connectorData: Record<string, ConnectorData>,
  widgetBirthTimes: Map<WidgetId, number>,
  now: number,
  notifications: NotificationItem[],
  activityFeed: ActivityItem[],
  _bootTime: number,
  transcriptPanel?: { active: boolean; x: number; y: number; text: string; systemText?: string; bornAt?: number },
  focusedWidget?: WidgetId | null,
  fingerTip?: { x: number; y: number } | null,
  drillDown?: DrillDownState | null,
) {
  const githubData = connectorData['github']?.data as unknown as GitHubData | undefined
  const calData    = connectorData['calendar']?.data as unknown as CalendarData | undefined
  const linearData = connectorData['linear']?.data as unknown as LinearData | undefined

  // Helper: get position + scale for a widget based on focus state
  const getDrawParams = (widgetId: WidgetId): { x: number; y: number; preScale: () => void; postScale: () => void } => {
    const pos = WIDGET_POSITIONS[widgetId]
    if (focusedWidget === widgetId) {
      const centre = getFocusCentre(widgetId)
      return {
        x: centre.x, y: centre.y,
        preScale:  () => { ctx.save(); ctx.scale(2, 2) },
        postScale: () => { ctx.restore() },
      }
    } else if (focusedWidget) {
      return {
        x: pos.x, y: pos.y,
        preScale:  () => { ctx.save(); ctx.globalAlpha = 0.3 },
        postScale: () => { ctx.restore() },
      }
    }
    return { x: pos.x, y: pos.y, preScale: () => {}, postScale: () => {} }
  }

  if (activeWidgets.has('sprint')) {
    const born = widgetBirthTimes.get('sprint') ?? now
    const p = getDrawParams('sprint')
    p.preScale()
    if (focusedWidget === 'sprint' && drillDown?.type === 'linear_status' && linearData) {
      // Drill-down: show filtered tickets for the selected status
      const H = 220
      const dx = (1280 - 290 * 2) / 2 / 2
      const dy = (720 - H * 2) / 2 / 2
      drawPanel(ctx, dx, dy, 290, H, `SPRINT \u2014 ${drillDown.statusFilter?.toUpperCase() ?? ''}`, now - born)
      ctx.save()
      clipToPanel(ctx, dx, dy, 290, H)
      drawFilteredTickets(ctx, dx, dy, 290, linearData.assignedTickets, drillDown.statusFilter ?? '')
      drawBackButton(ctx, dx, dy, 290, H, C)
      ctx.restore()
    } else {
      drawLinearOverviewWidget(ctx, p.x, p.y, linearData ?? null, now - born)
    }
    p.postScale()
  }

  if (activeWidgets.has('github')) {
    const born = widgetBirthTimes.get('github') ?? now
    const p = getDrawParams('github')
    p.preScale()
    drawGitHubWidget(ctx, p.x, p.y, githubData ?? null, now - born)
    p.postScale()
  }

  if (activeWidgets.has('calendar')) {
    const born = widgetBirthTimes.get('calendar') ?? now
    const p = getDrawParams('calendar')
    p.preScale()
    drawCalendarWidget(ctx, p.x, p.y, calData ?? null, now - born)
    p.postScale()
  }

  if (activeWidgets.has('notifications')) {
    const born = widgetBirthTimes.get('notifications') ?? now
    const p = getDrawParams('notifications')
    p.preScale()
    if (focusedWidget === 'notifications' && drillDown?.type === 'notification') {
      // Drill-down: show full Slack message in-panel (AMBER theme)
      // Use fixed drill-down height and centre for it
      const H = 220
      const dx = (1280 - 290 * 2) / 2 / 2  // centred X for 290px panel at 2×
      const dy = (720 - H * 2) / 2 / 2      // centred Y for drill-down height at 2×
      drawPanel(ctx, dx, dy, 290, H, 'SLACK MESSAGE', now - born, AMBER)
      ctx.save()
      clipToPanel(ctx, dx, dy, 290, H)
      drawDrillDownContent(ctx, dx, dy, 290, drillDown, AMBER)
      drawBackButton(ctx, dx, dy, 290, H, AMBER)
      ctx.restore()
    } else {
      drawNotificationsWidget(ctx, p.x, p.y, notifications, now - born)
    }
    p.postScale()
  }

  if (activeWidgets.has('activity')) {
    const born = widgetBirthTimes.get('activity') ?? now
    const p = getDrawParams('activity')
    p.preScale()
    if (focusedWidget === 'activity' && drillDown?.type === 'activity') {
      // Drill-down: show full Gmail email in-panel (GREEN theme)
      const H = 220
      const dx = (1280 - 290 * 2) / 2 / 2
      const dy = (720 - H * 2) / 2 / 2
      drawPanel(ctx, dx, dy, 290, H, 'EMAIL', now - born)
      ctx.save()
      clipToPanel(ctx, dx, dy, 290, H)
      drawDrillDownContent(ctx, dx, dy, 290, drillDown, C)
      drawBackButton(ctx, dx, dy, 290, H, C)
      ctx.restore()
    } else {
      drawActivityFeedWidget(ctx, p.x, p.y, activityFeed, now - born)
    }
    p.postScale()
  }

  if (transcriptPanel?.active) {
    const age = transcriptPanel.bornAt != null ? now - transcriptPanel.bornAt : 300
    drawTranscriptPanel(ctx, transcriptPanel.x, transcriptPanel.y, transcriptPanel.text, transcriptPanel.systemText ?? '', age)
  }

  // ── Hover highlight + dwell-to-select on focused panel rows ──
  if (focusedWidget && fingerTip && !drillDown) {
    const bounds = WIDGET_BOUNDS[focusedWidget]
    if (bounds) {
      const centre = getFocusCentre(focusedWidget)
      const panelTopY = centre.y * 2 + 38 * 2
      const rowHeight = 20 * 2 // uniform 20px rows at 2× scale
      const maxItems = focusedWidget === 'notifications' ? 5
        : focusedWidget === 'activity' ? 6
        : focusedWidget === 'sprint' ? 4  // 4 status rows
        : 5
      const panelLeftX = centre.x * 2
      const panelRightX = panelLeftX + bounds.w * 2

      if (fingerTip.x >= panelLeftX && fingerTip.x <= panelRightX) {
        const rowIdx = Math.floor((fingerTip.y - panelTopY) / rowHeight)
        if (rowIdx >= 0 && rowIdx < maxItems) {
          // Dwell tracking
          if (rowIdx !== dwellRowIdx) {
            dwellRowIdx = rowIdx
            dwellStartTime = now
            dwellFired = false
          }
          const dwellElapsed = now - dwellStartTime
          const dwellProgress = Math.min(1, dwellElapsed / DWELL_MS)

          // Fire selection when dwell completes
          if (dwellProgress >= 1 && !dwellFired) {
            dwellFired = true
          }

          const highlightY = panelTopY + rowIdx * rowHeight
          const rowW = bounds.w * 2 - 8

          ctx.save()

          // Row highlight background
          ctx.fillStyle = `rgba(0, 255, 65, ${0.05 + dwellProgress * 0.1})`
          ctx.strokeStyle = C.primary
          ctx.lineWidth = 1
          ctx.shadowColor = C.primary
          ctx.shadowBlur = 4 + dwellProgress * 8
          ctx.beginPath()
          ctx.roundRect(panelLeftX + 4, highlightY, rowW, rowHeight, 3)
          ctx.fill()
          ctx.stroke()
          ctx.shadowBlur = 0

          // Progress bar (fills left → right along bottom of row)
          if (dwellProgress > 0 && dwellProgress < 1) {
            const barH = 3
            const barY = highlightY + rowHeight - barH - 2
            // Track background
            ctx.fillStyle = 'rgba(0, 255, 65, 0.1)'
            ctx.fillRect(panelLeftX + 8, barY, rowW - 8, barH)
            // Fill
            ctx.fillStyle = C.primary
            ctx.shadowColor = C.glow
            ctx.shadowBlur = 6
            ctx.fillRect(panelLeftX + 8, barY, (rowW - 8) * dwellProgress, barH)
            ctx.shadowBlur = 0
          }

          // Completion flash
          if (dwellFired) {
            ctx.fillStyle = 'rgba(0, 255, 65, 0.2)'
            ctx.fillRect(panelLeftX + 4, highlightY, rowW, rowHeight)
          }

          // Fingertip indicator dot
          ctx.fillStyle = C.primary
          ctx.beginPath()
          ctx.arc(fingerTip.x, fingerTip.y, 5, 0, Math.PI * 2)
          ctx.fill()

          ctx.restore()
        } else {
          // Finger outside rows — reset dwell
          dwellRowIdx = -1
          dwellStartTime = 0
        }
      } else {
        // Finger outside panel — reset dwell
        dwellRowIdx = -1
        dwellStartTime = 0
      }
    }
  } else if (!focusedWidget) {
    // Not in focus mode — reset dwell
    dwellRowIdx = -1
    dwellStartTime = 0
    dwellFired = false
  }

  // ── Dwell-to-select for back button (when drilled down) ──
  if (focusedWidget && fingerTip && drillDown) {
    const bounds = WIDGET_BOUNDS[focusedWidget]
    if (bounds) {
      // Use the same drill-down dimensions as the rendering code
      const drillH = 220
      const drillW = 290
      const dx = (1280 - drillW * 2) / 2  // screen-space X of panel left edge
      const dy = (720 - drillH * 2) / 2   // screen-space Y of panel top edge
      const backBtnY = dy + (drillH - 22) * 2  // back button Y in screen space
      const panelLeftX = dx
      const panelRightX = dx + drillW * 2

      if (fingerTip.x >= panelLeftX && fingerTip.x <= panelRightX &&
          fingerTip.y >= backBtnY && fingerTip.y <= backBtnY + 40) {
        // Hovering back button
        if (dwellRowIdx !== -99) { // -99 = back button sentinel
          dwellRowIdx = -99
          dwellStartTime = now
          dwellFired = false
        }
        const dwellElapsed = now - dwellStartTime
        const dwellProgress = Math.min(1, dwellElapsed / DWELL_MS)
        if (dwellProgress >= 1 && !dwellFired) {
          dwellFired = true
        }

        // Draw back button highlight + progress
        ctx.save()
        ctx.fillStyle = `rgba(0, 255, 65, ${0.05 + dwellProgress * 0.12})`
        ctx.fillRect(panelLeftX + 4, backBtnY, bounds.w * 2 - 8, 36)
        if (dwellProgress > 0 && dwellProgress < 1) {
          ctx.fillStyle = C.primary
          ctx.fillRect(panelLeftX + 8, backBtnY + 30, (bounds.w * 2 - 16) * dwellProgress, 3)
        }
        // Fingertip dot
        ctx.fillStyle = C.primary
        ctx.beginPath()
        ctx.arc(fingerTip.x, fingerTip.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      } else {
        dwellRowIdx = -1
        dwellStartTime = 0
      }
    }
  }
}
