# CIPHER HUD Overhaul — Design Spec

## Context

CIPHER is a JARVIS-style HUD overlay (React + Canvas 2D + Vite) for OBS streaming and dev dashboard use. Live testing revealed critical issues: the voice engine loops infinitely on mic denial (500+ errors), only 2 of 5+ possible widgets render, the right side of the screen is empty, and matrix rain is barely visible. GitHub and Calendar connectors fetch data but have no rendering code.

This spec covers Phase 1 (fix + polish) and Phase 2 (new integrations) combined into a single implementation.

## Goals

- Fix all broken features (voice engine, widget empty states)
- Add 7 new canvas widgets filling both sides of the HUD
- Implement hybrid visual theme: green Matrix rain + cyan JARVIS data panels + amber notifications
- Add 3 new connectors (Slack, Gmail, Linear) with mock data fallbacks
- Add listening indicator, activity feed, mini metrics, and pomodoro timer

## Non-Goals

- Agent command center (Claude API, task dispatch) — Phase 3
- Backend server — all data flows through Vite proxy
- Mobile/responsive layout — fixed 1280x720 canvas

---

## Architecture

### Visual Theme: Three-Color Zone System

| Zone | Color | Position | Content |
|------|-------|----------|---------|
| Green (Matrix) | `#00ff41` | Left side | Sprint, Issues, Linear, Activity Feed |
| Cyan (JARVIS) | `#00c8ff` | Right side | GitHub, Calendar |
| Amber (Alerts) | `#ffa000` | Right side (below cyan) | Notifications (Slack + Gmail) |

### Widget Layout (1280x720 canvas)

```
 [CIPHER] [VISIBLE]     ◈ CIPHER LISTENING          [14:32:08]
 ┌─────────────────┐                          ┌─────────────────┐
 │ SPRINT STATUS   │                          │ GITHUB ACTIVITY │
 │ (green, x=24)   │     ╭──  rings  ──╮     │ (cyan, x=966)   │
 │ y=80, w=290     │     │             │     │ y=80, w=290     │
 └─────────────────┘     │   center    │     └─────────────────┘
 ┌─────────────────┐     │             │     ┌─────────────────┐
 │ MY OPEN ISSUES  │     ╰─────────────╯     │ CALENDAR        │
 │ y=310, w=290    │                          │ (cyan) y=240    │
 └─────────────────┘                          └─────────────────┘
 ┌─────────────────┐                          ┌─────────────────┐
 │ LINEAR TICKETS  │                          │ NOTIFICATIONS   │
 │ y=430, w=290    │                          │ (amber) y=400   │
 └─────────────────┘                          └─────────────────┘
 ┌──────────────────────────────────┐    UPTIME: 2h14m | POMO: 18:22
 │ ACTIVITY FEED (y=580, w=400)    │
 └──────────────────────────────────┘
 ═══════════════ STATUS BAR: CIPHER v2.0 ◉ JIRA ◉ GITHUB ◉ CAL ═══
```

### New Color Constants

```ts
// Cyan (JARVIS panels)
const CYAN = {
  primary: 'rgba(0, 200, 255, 0.85)',
  mid:     'rgba(0, 200, 255, 0.50)',
  dim:     'rgba(0, 200, 255, 0.25)',
  fill:    'rgba(0, 8, 20, 0.78)',
  glow:    '#00c8ff',
}

// Amber (notifications)
const AMBER = {
  primary: 'rgba(255, 160, 0, 0.85)',
  mid:     'rgba(255, 160, 0, 0.50)',
  dim:     'rgba(255, 160, 0, 0.25)',
  fill:    'rgba(20, 12, 0, 0.78)',
  glow:    '#ffa000',
}
```

---

## Bug Fixes

### 1. Voice Engine Infinite Retry Loop

**File**: `src/engines/VoiceEngine.ts`
**Problem**: `onend` always restarts even after `not-allowed` error.
**Fix**: Add `fatalError` flag. On fatal errors (`not-allowed`, `service-not-allowed`), set flag and stop retrying. Add `statusCallback` parameter to report voice state to HUD.

### 2. Widget Empty States

**File**: `src/canvas/layers/WidgetLayer.ts`
**Problem**: Sprint shows "Loading..." forever when Jira not configured.
**Fix**: Check connector existence and status. Show "NOT CONFIGURED" (dim amber) when no connector, "CONNECTION ERROR" (dim red) on error, "Loading..." only when actually loading.

### 3. Matrix Rain Visibility

**File**: `src/canvas/layers/MatrixRainLayer.ts`
**Problem**: 18% opacity at NORMAL is barely visible.
**Fix**: Change NORMAL config to `{ opacity: 0.30, density: 0.55, speedScale: 0.85 }`.

---

## New Widgets

### GitHub Activity (cyan, right side)
- **Position**: x=966, y=80, w=290
- **Sections**: "OPEN PRs" (up to 3), "REVIEW REQUESTS" (up to 2), "ASSIGNED ISSUES" (up to 3)
- **Data source**: Existing `connectorData['github']` — already fetched, just needs rendering
- **Empty state**: "NOT CONFIGURED" or "NO ACTIVITY"

### Calendar (cyan, right side)
- **Position**: x=966, y=240, w=290
- **Sections**: "NEXT" (upcoming event with countdown), "TODAY" (up to 4 events with times)
- **Data source**: Existing `connectorData['calendar']` — already fetched
- **Features**: Meet link indicator, all-day event marker

### Linear Tickets (green, left side)
- **Position**: x=24, y=430, w=290
- **Content**: Up to 5 assigned tickets with identifier, title, state, priority dots
- **Data source**: New `LinearConnector` with mock fallback

### Notifications Hub (amber, right side)
- **Position**: x=966, y=400, w=290
- **Content**: Unified Slack + Gmail feed, sorted by time. Source label, truncated text, relative time.
- **Data source**: Aggregated from `SlackConnector` + `GmailConnector` into `state.notifications`

### Activity Feed (green, bottom-left)
- **Position**: x=24, y=580, w=400
- **Content**: Horizontal timeline of recent actions across all connectors. Fading opacity for older items.
- **Data source**: `state.activityFeed` populated by connector updates

### Mini Metrics (bottom-right)
- **Position**: x=966, y=600, w=290
- **Content**: Session uptime, pomodoro countdown, focus mode indicator
- **Data source**: Local state (boot time ref, timer ref)

### Listening Indicator (top-center, in RingLayer)
- **Position**: Centered horizontally, y=16
- **States**: Pulsing "CIPHER LISTENING" (green) when active, "MIC DENIED" (red) when blocked, hidden when inactive
- **Data source**: `voiceStatus` from HUD state

---

## New Connectors

All follow the existing `Connector` interface pattern with Vite proxy auth. Each includes mock data fallback when API tokens aren't configured.

### SlackConnector
- **ID**: `slack`, poll every 30s
- **Endpoints**: `/slack/api/conversations.list`, `/slack/api/search.messages`
- **Returns**: `SlackData { unreadCount, mentions[], recentDMs[] }`
- **Env**: `VITE_SLACK_BOT_TOKEN`

### GmailConnector
- **ID**: `gmail`, poll every 60s
- **Endpoints**: `/gmail/gmail/v1/users/me/messages`
- **Returns**: `GmailData { unreadCount, recentThreads[] }`
- **Env**: `VITE_GMAIL_TOKEN`

### LinearConnector
- **ID**: `linear`, poll every 60s
- **Endpoint**: `/linear/graphql` (GraphQL query for assigned issues)
- **Returns**: `LinearData { assignedTickets[], projectName }`
- **Env**: `VITE_LINEAR_TOKEN`

### Mock Data Fallback Pattern
When `poll()` fails (no token or API error), return realistic mock data with `isMock: true` flag. Widget shows subtle "MOCK" badge so user knows it's sample data.

---

## New Types

```ts
// Widget IDs (expanded)
type WidgetId = 'sprint' | 'issues' | 'clock' | 'status' | 'search'
  | 'github' | 'calendar' | 'linear' | 'notifications' | 'activity' | 'metrics'

// Voice status
type VoiceStatus = 'inactive' | 'listening' | 'error' | 'denied'

// Linear
interface LinearTicket { id: string; identifier: string; title: string; state: string; priority: number; url: string }
interface LinearData { assignedTickets: LinearTicket[]; projectName: string }

// Slack
interface SlackMessage { channel: string; author: string; text: string; timestamp: string; isDM: boolean }
interface SlackData { unreadCount: number; mentions: SlackMessage[]; recentDMs: SlackMessage[] }

// Gmail
interface GmailThread { id: string; subject: string; from: string; snippet: string; timestamp: string; unread: boolean }
interface GmailData { unreadCount: number; recentThreads: GmailThread[] }

// Unified
interface NotificationItem { source: 'slack' | 'gmail' | 'github'; text: string; timestamp: number; priority: 'low' | 'normal' | 'high' }
interface ActivityItem { source: string; text: string; timestamp: number; icon: string }
```

---

## New HUD State Fields

```ts
voiceStatus: VoiceStatus        // 'inactive' | 'listening' | 'error' | 'denied'
notifications: NotificationItem[] // capped at 20
activityFeed: ActivityItem[]      // capped at 30
```

New reducer actions: `SET_VOICE_STATUS`, `ADD_NOTIFICATION`, `ADD_ACTIVITY`

---

## Files Modified

| File | Changes |
|------|---------|
| `src/types/index.ts` | New widget IDs, data interfaces, VoiceStatus, new HUDAction variants |
| `src/store/hudStore.ts` | New state fields, reducer cases |
| `src/engines/VoiceEngine.ts` | Fix infinite retry, add statusCallback, new widget aliases |
| `src/canvas/layers/WidgetLayer.ts` | 6 new draw functions, cyan/amber color systems, refactor drawPanel for color schemes |
| `src/canvas/layers/RingLayer.ts` | Listening indicator, enhanced status bar |
| `src/canvas/layers/MatrixRainLayer.ts` | Increase baseline opacity/density |
| `src/canvas/HUDCanvas.tsx` | Wire new widgets, register new connectors, pass voice status |
| `src/connectors/SlackConnector.ts` | NEW — Slack API + mock fallback |
| `src/connectors/GmailConnector.ts` | NEW — Gmail API + mock fallback |
| `src/connectors/LinearConnector.ts` | NEW — Linear GraphQL + mock fallback |
| `vite.config.ts` | New proxy routes for Slack, Gmail, Linear |
| `.env.local.example` | New env var templates |
| `src/components/ConfigDrawer.tsx` | New connector configs, updated references |
| `src/App.tsx` | New widget toggle buttons |

---

## Verification

1. `npm run build` — TypeScript compiles without errors
2. `npm run dev` — Dev server starts
3. Open `http://localhost:5173` — Camera prompt appears, HUD renders on grant
4. Open `http://localhost:5173?overlay=true` — HUD renders without camera, all widgets visible
5. Verify voice engine: deny mic permission — no console spam, "MIC DENIED" indicator shows
6. Verify widgets: all 7 new widgets render with mock data
7. Verify color zones: green left, cyan right, amber notifications
8. Verify matrix rain: noticeably more visible than before
9. Click all widget toggle buttons — each shows/hides correctly
10. Verify status bar shows all connector health dots
