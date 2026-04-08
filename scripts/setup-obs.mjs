#!/usr/bin/env node
// CIPHER — OBS Auto-Setup
// Connects to OBS WebSocket and creates the "CIPHER HUD" scene with:
//   Layer 1: Your webcam (Video Capture Device)
//   Layer 2: CIPHER transparent overlay (Browser Source)
// Then starts the Virtual Camera.
//
// Prerequisites:
//   1. OBS Studio 28+ must be running
//   2. OBS → Tools → obs-websocket Settings → Enable → port 4455
//   3. Set OBS_WS_PASSWORD env var (or pass as first CLI arg) if you set a password
//
// Usage:
//   npm run setup-obs
//   OBS_WS_PASSWORD=mypassword npm run setup-obs

import OBSWebSocket from 'obs-websocket-js'

const SCENE_NAME    = 'CIPHER HUD'
const CIPHER_URL    = 'http://localhost:5173?overlay=true'
const BROWSER_CSS   = 'html, body, #root { background: transparent !important; background-color: rgba(0,0,0,0) !important; margin: 0; overflow: hidden; }'
const OBS_PORT      = 4455
const password      = process.env.OBS_WS_PASSWORD ?? process.argv[2] ?? ''

const obs = new OBSWebSocket()

function ok(msg)   { console.log(`  ✓  ${msg}`) }
function info(msg) { console.log(`  ·  ${msg}`) }
function err(msg)  { console.error(`  ✗  ${msg}`) }

async function run() {
  console.log('\n  CIPHER — OBS Auto-Setup\n  ' + '─'.repeat(36))

  // ── Connect ────────────────────────────────────────────────────────────────
  try {
    const { obsWebSocketVersion, negotiatedRpcVersion } =
      await obs.connect(`ws://127.0.0.1:${OBS_PORT}`, password || undefined)
    ok(`Connected to OBS WebSocket ${obsWebSocketVersion} (RPC ${negotiatedRpcVersion})`)
  } catch (e) {
    err('Could not connect to OBS WebSocket.')
    console.error('\n  Make sure:\n  · OBS Studio is running\n  · Tools → obs-websocket Settings → Enable WebSocket Server\n  · Port is 4455\n  · Password matches OBS_WS_PASSWORD env var\n')
    process.exit(1)
  }

  // ── Detect available input kinds ──────────────────────────────────────────
  const { inputKinds } = await obs.call('GetInputKindList', { unversioned: false })
  const hasMacCamera   = inputKinds.includes('av_capture_input') || inputKinds.includes('macos-avcapture') || inputKinds.includes('macos-avcapture-fast')
  const hasWinCamera   = inputKinds.includes('dshow_input')
  const cameraKind     = hasMacCamera
    ? (inputKinds.includes('macos-avcapture') ? 'macos-avcapture' : inputKinds.includes('macos-avcapture-fast') ? 'macos-avcapture-fast' : 'av_capture_input')
    : hasWinCamera ? 'dshow_input' : null

  if (cameraKind) {
    ok(`Camera source kind: ${cameraKind}`)
  } else {
    info('No supported camera input found — skipping webcam source (add manually if needed)')
  }

  // ── Create or reuse scene ─────────────────────────────────────────────────
  const { scenes } = await obs.call('GetSceneList')
  const sceneExists = scenes.some(s => s.sceneName === SCENE_NAME)

  if (sceneExists) {
    info(`Scene "${SCENE_NAME}" already exists — reusing it`)
  } else {
    await obs.call('CreateScene', { sceneName: SCENE_NAME })
    ok(`Created scene: "${SCENE_NAME}"`)
  }

  // ── Get existing inputs to avoid duplicates ────────────────────────────────
  const { inputs } = await obs.call('GetInputList', {})
  const inputNames  = new Set(inputs.map(i => i.inputName))

  // ── Add webcam source ─────────────────────────────────────────────────────
  let webcamItemId = null
  if (cameraKind && !inputNames.has('Webcam')) {
    try {
      const result = await obs.call('CreateInput', {
        sceneName:        SCENE_NAME,
        inputName:        'Webcam',
        inputKind:        cameraKind,
        inputSettings:    {},
        sceneItemEnabled: true,
      })
      webcamItemId = result.sceneItemId
      ok('Added webcam source (Webcam)')
    } catch (e) {
      info(`Could not add webcam automatically: ${e.message}`)
      info('Add a Video Capture Device source manually in OBS')
    }
  } else if (inputNames.has('Webcam')) {
    info('Webcam source already exists — skipping')
  }

  // ── Add CIPHER browser source ─────────────────────────────────────────────
  let browserItemId = null
  const browserName = 'CIPHER Overlay'
  if (!inputNames.has(browserName)) {
    const result = await obs.call('CreateInput', {
      sceneName:        SCENE_NAME,
      inputName:        browserName,
      inputKind:        'browser_source',
      inputSettings:    {
        url:                  CIPHER_URL,
        width:                1280,
        height:               720,
        css:                  BROWSER_CSS,
        is_local_file:        false,
        restart_when_active:  false,
        shutdown:             false,
        reroute_audio:        false,
      },
      sceneItemEnabled: true,
    })
    browserItemId = result.sceneItemId
    ok(`Added browser source: "${browserName}" → ${CIPHER_URL}`)
  } else {
    info(`"${browserName}" already exists — updating URL`)
    await obs.call('SetInputSettings', {
      inputName:     browserName,
      inputSettings: { url: CIPHER_URL, css: BROWSER_CSS, width: 1280, height: 720 },
    })
    // Get the existing scene item id
    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: SCENE_NAME })
    const item = sceneItems.find(i => i.sourceName === browserName)
    if (item) browserItemId = item.sceneItemId
  }

  // ── Put browser overlay on top (higher index = renders on top in OBS) ──────
  if (browserItemId !== null) {
    try {
      const { sceneItems: items } = await obs.call('GetSceneItemList', { sceneName: SCENE_NAME })
      const maxIdx = Math.max(...items.map(i => i.sceneItemIndex), 0)
      await obs.call('SetSceneItemIndex', {
        sceneName:      SCENE_NAME,
        sceneItemId:    browserItemId,
        sceneItemIndex: maxIdx,
      })
      ok('CIPHER overlay moved to top layer')
    } catch (e) {
      info('Could not reorder layers — drag "CIPHER Overlay" above "Webcam" in OBS manually')
    }
  }

  // ── Switch to the new scene ────────────────────────────────────────────────
  try {
    await obs.call('SetCurrentProgramScene', { sceneName: SCENE_NAME })
    ok(`Switched to scene: "${SCENE_NAME}"`)
  } catch (_) { /* not fatal */ }

  // ── Start Virtual Camera ───────────────────────────────────────────────────
  try {
    const { outputActive } = await obs.call('GetVirtualCamStatus')
    if (outputActive) {
      info('Virtual camera already running')
    } else {
      await obs.call('StartVirtualCam')
      ok('Virtual camera started')
    }
  } catch (e) {
    info(`Could not start virtual camera: ${e.message}`)
  }

  await obs.disconnect()

  console.log(`
  ─────────────────────────────────────────
  ✓  Setup complete!

  Next steps:
  1. Make sure CIPHER is running:  npm run dev
  2. In Zoom / Meet / Teams:
       Settings → Video → Camera → "OBS Virtual Camera"
  3. Your face + CIPHER HUD overlay will appear as your camera feed.

  To redo this setup at any time:  npm run setup-obs
  ─────────────────────────────────────────
`)
}

run().catch(e => {
  err(`Unexpected error: ${e.message}`)
  process.exit(1)
})
