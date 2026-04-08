# Gesture Overhaul + Interactive Mode Panel — Design Spec
**Date:** 2026-04-07
**Status:** Approved

---

## Context

CIPHER is used as a video call overlay (OBS virtual camera). The existing setup has two voice modes running in parallel — a basic browser Speech API engine (VoiceEngine) with wake word detection, and a premium Deepgram + Cartesia interactive mode. This is unnecessary complexity. The goal is to collapse to a single model: **gestures control panels, Rock On activates the one voice mode (InteractiveMode)**. VoiceEngine is removed entirely. The gesture set is also overhauled to fix a pinch/fist confusion bug and remap fingers to more useful panel groupings.

---

## Gesture Mapping — Final

| Gesture | Action | Change |
|---|---|---|
| Open Palm 🖐 (5 fingers) | Show all panels | Unchanged |
| Fist ✊ (hold 800ms) | Close all panels | Was: stealth toggle |
| Thumbs Up 👍 | Toggle stealth mode | Was: cosmetic confirm |
| Rock On 🤘 | Toggle InteractiveMode (Deepgram listen) | Was: voice wake word |
| Finger 1 ☝️ (index only) | Toggle Sprint + Issues group | Was: Sprint only |
| Finger 2 ✌️ (index + middle) | Toggle GitHub | Was: Issues |
| Finger 3 🤟 (+ ring) | Toggle Calendar | Was: GitHub |
| Finger 4 🖖 (+ pinky) | Toggle Notifications | Was: Calendar |
| Pinch | **Removed** | Confused with fist |

### Finger 1 group toggle behavior
If both Sprint and Issues are active → hide both. Otherwise → show both. Single gesture handles the pair as a unit regardless of individual state.

### Unfingermap­ped panels
`activity` and `metrics` are accessible via Open Palm (show all) only. `metrics` shows session uptime only; `activity` has no active connector.

---

## InteractiveMode — Changes

InteractiveMode (Deepgram STT + Cartesia TTS) becomes the single voice system. It is toggled on/off by Rock On.

### Current behaviour (to change)
- One-shot: activates, executes one command, then auto-deactivates
- 10-second silence auto-deactivate

### New behaviour
- **Toggle**: Rock On activates if inactive, deactivates if active
- **Stays listening**: does not auto-deactivate after executing a command — keeps the Deepgram socket open until Rock On is pressed again or Fist closes all
- **Silence timeout extended**: 60 seconds (up from 10s) — long enough for natural pauses in a meeting
- **Transcript panel**: on activate, dispatches `TOGGLE_TRANSCRIPT` with palm `(x, y)` so a panel spawns at palm position showing the live Deepgram transcript
- **On each transcript result**: dispatch `UPDATE_TRANSCRIPT` with the text in addition to existing `COMMAND_RECEIVED`
- **On deactivate**: dispatch `TOGGLE_TRANSCRIPT` to close the panel

### What stays the same in InteractiveMode
- Deepgram WebSocket STT (nova-2, smart_format, interim_results)
- Cartesia TTS for responses (fallback to browser TTS if no API key)
- Command parsing (show/hide panels, search, refresh, hide all)
- Activation chime

---

## Transcript Panel

### Purpose
A live transcription display panel that appears when InteractiveMode is active. Shows what Deepgram is hearing in real-time — both interim (with `...`) and final results.

### Spawn behaviour
- Panel spawns at palm center `(x, y)` captured from `GestureEngine.getHandLandmarks()` at the moment Rock On fires
- Stays fixed at that position for the entire session (does not track the hand)
- Closed when InteractiveMode deactivates

### Visual design
Cyberpunk panel matching CIPHER HUD aesthetic:
- Dark background `rgba(0, 20, 10, 0.9)`
- `#00ff50` border + corner bracket decorations (consistent with existing `drawPanel`)
- Title row: `◈ INTERACTIVE` left, `● DEEPGRAM` right
- Body: live transcript text (last 120 chars), blinking cursor
- Footer: `ROCK ON TO CLOSE · FIST TO CLEAR ALL`
- Glow: `0 0 16px rgba(0,255,80,0.25)`

---

## Architecture

### GestureEngine.ts
- Remove `isPinch` function and all references
- Remove `'pinch'` from `BASE_GESTURES`
- Change `FINGER_WIDGETS` to `WidgetId[][]`:
  ```ts
  const FINGER_WIDGETS: WidgetId[][] = [
    ['sprint', 'issues'],  // finger 1
    ['github'],            // finger 2
    ['calendar'],          // finger 3
    ['notifications'],     // finger 4
  ]
  ```
- Update finger case in `handleGesture`: all in group active → hide all; else → show all
- `thumbs_up` → dispatch `{ type: 'TOGGLE_STEALTH' }` (already exists in store + types)
- `fist` → dispatch `{ type: 'HIDE_ALL' }`
- `rock_on` → read palm center from `this.lastLandmarks` via new `getPalmCenter(lm)` helper, dispatch `{ type: 'TOGGLE_TRANSCRIPT', x, y }`
- Add `getPalmCenter(lm: Landmark[]): { x: number; y: number }` — average landmarks [0,5,9,13,17], mirror x with `(1 - lm[i].x) * canvasWidth`; return as canvas pixel coords
- GestureEngine needs canvas dimensions to convert normalised coords → pixels; add `setCanvasSize(w, h)` method called from HUDCanvas on init
- Priority order (updated): Rock On → Fist (hold) → Thumbs Up → Finger Count

### InteractiveMode.ts
- Add `toggle()` method: calls `activate()` if `!this.active`, `deactivate()` if `this.active`
- Change `SILENCE_MS` from `10000` to `60000`
- Remove `this.deactivate()` call at end of `handleTranscript` — keep listening after command
- On `activate()`: dispatch `{ type: 'TOGGLE_TRANSCRIPT', x: storedX, y: storedY }` — palm coords set externally before activate
- Add `setPalmPosition(x: number, y: number)` method — called by HUDCanvas when Rock On fires, before toggling
- On each final transcript in `socket.onmessage`: dispatch `{ type: 'UPDATE_TRANSCRIPT', text: transcript }`
- On interim transcript: dispatch `{ type: 'UPDATE_TRANSCRIPT', text: transcript + '...' }`
- On `deactivate()`: dispatch `{ type: 'TOGGLE_TRANSCRIPT', x: 0, y: 0 }` to close the panel

### VoiceEngine.ts
- **Deleted entirely** — no longer used

### types/index.ts
- Add to `HUDAction` union:
  ```ts
  | { type: 'TOGGLE_TRANSCRIPT'; x: number; y: number }
  | { type: 'UPDATE_TRANSCRIPT'; text: string }
  ```
- Add to `HUDState`:
  ```ts
  transcriptPanel: { active: boolean; x: number; y: number; text: string }
  ```

### hudStore.ts
- Add `transcriptPanel: { active: false, x: 0, y: 0, text: '' }` to initial state
- Handle `TOGGLE_TRANSCRIPT`: if active → set `active: false`; if inactive → set `active: true, x, y`, clear text
- Handle `UPDATE_TRANSCRIPT`: if `transcriptPanel.active` → update text (keep last 120 chars)

### WidgetLayer.ts
- Add `drawTranscriptPanel(ctx, x, y, text, age)` function
- Consistent with existing `drawPanel` header style
- Blinking cursor using `Math.floor(Date.now() / 500) % 2`
- Called from `drawWidgets` when `transcriptPanel.active === true`
- `drawWidgets` signature gains `transcriptPanel` parameter

### HUDCanvas.tsx
- Remove `VoiceEngine` import and all usage (`voiceRef`, `voice.init`, `voice.start`, `voice.destroy`, `SET_VOICE_STATUS` handler)
- Replace Rock On handler: read palm position from `gestureRef.current?.getHandLandmarks()`, call `interactiveMode.setPalmPosition(x, y)`, then `interactiveMode.toggle()`
- Remove `COMMAND_RECEIVED` handler block that checks for `'awaiting command'`
- Remove `COMMAND_RECEIVED` handler block that checks for `'stealth'` (stealth is gesture-only now)
- Pass `transcriptPanel` state to `drawWidgets` call in render loop
- Call `gestureRef.current?.setCanvasSize(W, H)` after canvas dimensions are known

### ConfigDrawer.tsx
- Remove voice command reference table
- Remove voice status indicator (no VoiceEngine = no voice status)

---

## Files Changed

| File | Type |
|---|---|
| `src/engines/GestureEngine.ts` | Modified |
| `src/engines/InteractiveMode.ts` | Modified |
| `src/engines/VoiceEngine.ts` | **Deleted** |
| `src/store/hudStore.ts` | Modified |
| `src/types/index.ts` | Modified |
| `src/canvas/layers/WidgetLayer.ts` | Modified |
| `src/canvas/HUDCanvas.tsx` | Modified |
| `src/components/ConfigDrawer.tsx` | Modified |

---

## Verification

1. **Pinch removed** — close fist slowly, no `HIDE_ALL` fires before 800ms hold
2. **Fist (800ms)** — all panels close including transcript panel if open
3. **Thumbs Up** — stealth mode toggles; HUD chrome hides/shows
4. **Finger 1** — Sprint + Issues both toggle together (C behaviour: all on → all off, else all on)
5. **Fingers 2/3/4** — GitHub, Calendar, Notifications toggle individually
6. **Rock On** — InteractiveMode activates, transcript panel spawns at palm center, stays fixed
7. **Deepgram transcript** — interim text shows with `...`, final text shows clean, panel updates live
8. **Commands still work** — say "show github" while InteractiveMode active → GitHub panel appears, Cartesia speaks response, InteractiveMode stays listening
9. **Rock On again** — InteractiveMode deactivates, transcript panel closes
10. **Silence timeout** — panel stays open through 30+ seconds of silence, auto-closes at 60s
11. **VoiceEngine gone** — no wake word listening, no "cipher" trigger, no browser speech recognition running in background
