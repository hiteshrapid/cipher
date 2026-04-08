# CIPHER — Claude Code Context

CIPHER is a JARVIS-style HUD overlay built for OBS virtual camera use in video calls. It renders a full-screen 1280×720 canvas with Matrix-green neon aesthetics, live data panels, hand gesture control, and an interactive voice mode powered by Deepgram + Cartesia.

## Stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript 6 |
| Build | Vite 8 (Rolldown) |
| Rendering | HTML5 Canvas 2D — no CSS frameworks, no Three.js |
| Hand tracking | `@mediapipe/tasks-vision` 0.10.34 |
| STT | Deepgram nova-2 (WebSocket streaming) |
| TTS | Cartesia sonic-2 (fallback: browser SpeechSynthesis) |
| Audio FX | Web Audio API (procedural synthesis) |
| State | React Context + useReducer |
| API proxies | Vite custom server middleware |

## Dev Commands

```bash
npm run dev      # start dev server (http://localhost:5173)
npm run build    # tsc --noEmit + vite build
npm run lint     # ESLint
```

OBS overlay mode: open `http://localhost:5173?overlay=true` as a Browser Source.

---

## Architecture

### State — `src/store/hudStore.ts` + `src/types/index.ts`

Single global `HUDState` managed by `hudReducer`. Accessed via `useHUD()` hook.

Key state fields:
- `activeWidgets: Set<WidgetId>` — which panels are visible
- `alertLevel: 'NORMAL' | 'ALERT' | 'CRITICAL' | 'STEALTH'`
- `stealthMode: boolean` — hides chrome + dims matrix
- `transcriptPanel: { active, x, y, text }` — Deepgram live transcript panel
- `connectorData: Record<string, ConnectorData>` — latest data from each connector
- `searchResult / searchQuery` — Intel Card (voice search)
- `notifications[]` (max 20) / `activityFeed[]` (max 30)

All 19 action types are in `HUDAction` in `types/index.ts`.

### Engines — `src/engines/`

| File | Purpose |
|---|---|
| `GestureEngine.ts` | MediaPipe hands → gesture classification → dispatch |
| `InteractiveMode.ts` | Rock On activates Deepgram STT + Cartesia TTS |
| `AudioEngine.ts` | Web Audio procedural sounds + mic analyser for waveform |

### Connectors — `src/connectors/`

| File | Data |
|---|---|
| `ConnectorRegistry.ts` | Pub-sub polling registry for all connectors |
| `GitHubConnector.ts` | Open PRs, review requests, assigned issues |
| `CalendarConnector.ts` | Today's events, upcoming events, next event |
| `LinearConnector.ts` | Assigned tickets, project name (GraphQL) |
| `SlackConnector.ts` | Unread count, mentions, recent DMs |
| `GmailConnector.ts` | Unread threads, recent snippets |
| `SearchEngine.ts` | Cascading search: OpenAI → DuckDuckGo → Wikipedia |

All API calls are proxied through Vite — tokens never reach the browser.

### Canvas — `src/canvas/`

`HUDCanvas.tsx` is the main component. Renders at 60fps via `requestAnimationFrame`. Layers bottom to top:

1. **Webcam** — mirrored video feed (skipped in overlay mode)
2. **MatrixRainLayer** — falling katakana/ASCII, intensity scales with alert level
3. **HandLayer** — MediaPipe hand skeleton, per-finger neon colours
4. **RingLayer** — JARVIS chrome: rotating rings, corner brackets, scanline, status bar
5. **WidgetLayer** — floating data panels + transcript panel

### State Sync — `src/sync/StateSync.ts`

Bridges two browser tabs: the controller tab (gestures + data) and the OBS overlay tab (display only).

- Controller: `pushState()` → POST `/api/cipher-sync` on every state change
- Overlay: `startPolling()` → GET `/api/cipher-sync` every 80ms
- The `/api/cipher-sync` endpoint is a custom Vite dev server middleware in `vite.config.ts`

---

## Gesture System

MediaPipe tracks 21 landmarks per hand at ~10fps. Priority order: Rock On → Fist → Thumbs Up → Finger Count.

| Gesture | Action |
|---|---|
| 🖐 Open Palm (5 fingers) | Show all panels |
| ✊ Fist (hold 800ms) | Close all panels (also closes transcript panel) |
| 👍 Thumbs Up | Toggle stealth mode |
| 🤘 Rock On (index + pinky up) | Toggle InteractiveMode + transcript panel at palm |
| ☝️ Finger 1 | Toggle Sprint + Issues together (group) |
| ✌️ Finger 2 | Toggle GitHub |
| 🤟 Finger 3 | Toggle Calendar |
| 🖖 Finger 4 | Toggle Notifications |

**Group toggle rule (Finger 1):** if ALL widgets in the group are active → hide all; else → show all.

**Pinch is removed** — was too similar to a fist mid-transition.

---

## Interactive Voice Mode

Activated by Rock On. Deepgram streams live audio; Cartesia speaks responses.

- `GestureEngine` dispatches `TOGGLE_TRANSCRIPT` with palm `(x, y)` → panel spawns at that position, stays fixed
- `HUDCanvas` reacts to `transcriptPanel.active` via `useEffect` → calls `interactiveMode.activate()` / `deactivate()`
- `InteractiveMode` dispatches `UPDATE_TRANSCRIPT` on each Deepgram result (interim shows `...`, final is clean)
- Commands still parsed and executed (show/hide panels, search, refresh)
- Stays listening after executing a command — does NOT auto-deactivate
- Silence timeout: 60 seconds
- **InteractiveMode never dispatches `TOGGLE_TRANSCRIPT`** — panel state is owned exclusively by GestureEngine + the store

---

## Widget Panels

| WidgetId | Position | Data Source | Colour |
|---|---|---|---|
| `sprint` | Left top | Linear | Green |
| `issues` | Left mid | Linear | Green |
| `github` | Right top | GitHub | Cyan |
| `calendar` | Right mid | Google Calendar | Cyan |
| `notifications` | Right lower | Slack + Gmail + GitHub | Amber |
| `activity` | Left bottom | All connectors | Green |
| `metrics` | Right bottom | Session uptime only | Green |
| `search` | Centre overlay | SearchEngine (Intel Card) | Cyan |
| `clock` | Ring (always on) | — | — |
| `status` | Ring (always on) | — | — |

`activity` and `metrics` have no finger gesture — reachable via Open Palm or voice only.

---

## Environment Variables

All proxied server-side via `vite.config.ts`. Copy `.env.local.example` → `.env.local`.

| Variable | Purpose |
|---|---|
| `VITE_GITHUB_TOKEN` | GitHub PAT (repo + read:user scopes) |
| `VITE_GITHUB_REPOS` | Comma-separated `owner/repo` pairs to track |
| `VITE_GCAL_TOKEN` | Google OAuth2 access token |
| `VITE_GCAL_CALENDAR_ID` | Calendar ID (default: `primary`) |
| `VITE_SLACK_BOT_TOKEN` | Slack bot token (`xoxb-*`) |
| `VITE_GMAIL_TOKEN` | Google OAuth2 token (gmail.readonly) |
| `VITE_LINEAR_TOKEN` | Linear API key (`lin_api_*`) |
| `VITE_OPENAI_API_KEY` | GPT-4o-mini for search summaries |
| `VITE_DEEPGRAM_API_KEY` | Deepgram STT (InteractiveMode) |
| `VITE_CARTESIA_API_KEY` | Cartesia TTS voice responses |

---

## Key Design Decisions

**Tokens never in browser.** All API calls go through Vite's server middleware as proxies. The browser only talks to `/github`, `/gcal`, `/slack`, etc. — never to the real APIs directly.

**Canvas-first, no DOM widgets.** All HUD visuals are drawn to a 2D canvas. The only DOM elements are the hidden `<video>` element for webcam and the canvas itself. This enables `canvas.captureStream(30)` for OBS.

**InteractiveMode does not own panel state.** The transcript panel (`transcriptPanel` in store) is toggled exclusively by `TOGGLE_TRANSCRIPT` actions dispatched from `GestureEngine`. `InteractiveMode` only handles audio I/O and dispatches `UPDATE_TRANSCRIPT` for text updates. This prevents feedback loops.

**HIDE_ALL closes everything including transcript.** The `HIDE_ALL` reducer case clears `activeWidgets` and also resets `transcriptPanel` to inactive. Fist gesture is the single "clear all" action.

**Widget groups in GestureEngine.** `FINGER_WIDGETS` is `WidgetId[][]`. Finger 1 maps to `['sprint', 'issues']`. The toggle logic checks if ALL widgets in the group are active before deciding to hide or show.

**Alert level drives visuals.** `MatrixRainLayer` density/speed and `RingLayer` brightness/glow both scale with `alertLevel`. `STEALTH` disables matrix rain entirely.

---

## Specs

Design documents are in `docs/superpowers/specs/`:
- `2026-04-07-gesture-overhaul-design.md` — Gesture overhaul + InteractiveMode panel spec
