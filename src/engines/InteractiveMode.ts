// CIPHER — InteractiveMode
// Deepgram real-time STT + Cartesia TTS for voice interaction
// Activated by rock-on gesture; stays listening until toggled off.

import type { HUDAction, ParsedCommand, WidgetId } from '../types'
import { audioEngine } from './AudioEngine'

type Dispatch = (action: HUDAction) => void

// ─── Cartesia TTS (reuses shared AudioContext) ──────────────────────────────

async function speak(text: string): Promise<void> {
  const apiKey = import.meta.env.VITE_CARTESIA_API_KEY
  if (!apiKey) {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.1
    u.pitch = 0.9
    speechSynthesis.speak(u)
    return
  }

  try {
    const res = await fetch('/cartesia/tts/bytes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_id: 'sonic-2',
        transcript: text,
        voice: { mode: 'id', id: 'a0e99841-438c-4a64-b679-ae501e7d6091' },
        output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: 24000 },
      }),
    })

    if (!res.ok) throw new Error(`Cartesia error: ${res.status}`)

    const arrayBuffer = await res.arrayBuffer()
    // Reuse shared AudioContext — avoids suspended-context hang
    const audioCtx = await audioEngine.getSharedContext()
    console.log('CIPHER TTS: AudioContext state:', audioCtx.state, '| audio bytes:', arrayBuffer.byteLength)
    const float32 = new Float32Array(arrayBuffer)
    const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000)
    audioBuffer.getChannelData(0).set(float32)

    const source = audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioCtx.destination)
    source.start()

    // Timeout prevents hanging forever if onended never fires
    await Promise.race([
      new Promise<void>(resolve => { source.onended = () => resolve() }),
      new Promise<void>(resolve => setTimeout(resolve, 15000)),
    ])
    // Do NOT close shared context
  } catch (err) {
    console.warn('CIPHER: Cartesia TTS failed, falling back to browser:', err)
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.1
    u.pitch = 0.9
    speechSynthesis.speak(u)
  }
}

// ─── Command parser ──────────────────────────────────────────────────────────

const WIDGET_ALIASES: Record<string, WidgetId> = {
  sprint: 'sprint', overview: 'sprint', project: 'sprint',
  issues: 'issues', tickets: 'issues', tasks: 'issues',
  github: 'github', calendar: 'calendar',
  notifications: 'notifications', activity: 'activity',
}

function parseCommand(transcript: string): ParsedCommand | null {
  const t = transcript.toLowerCase().trim()

  if (/hide all|clear all|reset|close all/.test(t)) return { action: 'hideAll', raw: t }
  if (/refresh|reload|update|sync/.test(t)) return { action: 'refresh', raw: t }

  const searchMatch = t.match(
    /^(?:search(?:\s+for)?|find|look\s+up|what(?:'s|\s+is)(?:\s+(?:a|the))?(?:\s+(?:score|latest|news))?(?:\s+(?:of|on|about))?|tell\s+me\s+about|show\s+me|who\s+is|how\s+is\s+.+\s+doing|latest\s+(?:news\s+)?(?:on|about)|(?:give\s+me\s+)?(?:info|update|news|score)(?:\s+(?:on|about|of))?)\s+(.+)/
  )
  if (searchMatch) return { action: 'search', query: searchMatch[1].trim(), raw: t }

  for (const [alias, widgetId] of Object.entries(WIDGET_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(t)) {
      if (/^(show|open|bring up|display|pull up|get)/.test(t)) return { action: 'show', target: widgetId, raw: t }
      if (/^(hide|close|dismiss|remove|clear)/.test(t)) return { action: 'hide', target: widgetId, raw: t }
      return { action: 'show', target: widgetId, raw: t }
    }
  }

  return null
}

function executeCommand(cmd: ParsedCommand, dispatch: Dispatch): string {
  dispatch({ type: 'COMMAND_RECEIVED', text: cmd.raw })

  switch (cmd.action) {
    case 'show':
      if (cmd.target) dispatch({ type: 'SHOW_WIDGET', id: cmd.target })
      return `Showing ${cmd.target ?? 'panel'}`
    case 'hide':
      if (cmd.target) dispatch({ type: 'HIDE_WIDGET', id: cmd.target })
      return `Hiding ${cmd.target ?? 'panel'}`
    case 'hideAll':
      dispatch({ type: 'HIDE_ALL' })
      return 'All panels closed'
    case 'refresh':
      dispatch({ type: 'COMMAND_RECEIVED', text: '↺ refreshing connectors' })
      return 'Refreshing data'
    case 'search':
      if (cmd.query) {
        dispatch({ type: 'SEARCH_QUERY', query: cmd.query })
        dispatch({ type: 'COMMAND_RECEIVED', text: `◈ searching: ${cmd.query}` })
        return `Searching for ${cmd.query}`
      }
      return 'No query specified'
  }
  return ''
}

// ─── Interactive Mode (Deepgram STT) ────────────────────────────────────────

export class InteractiveMode {
  private active = false
  private dispatch: Dispatch | null = null
  private socket: WebSocket | null = null
  private mediaStream: MediaStream | null = null
  private mediaRecorder: MediaRecorder | null = null
  private silenceTimeout: number | null = null
  private SILENCE_MS = 60000  // 60s — stays open through natural pauses

  init(dispatch: Dispatch) {
    this.dispatch = dispatch
  }

  isActive(): boolean {
    return this.active
  }

  /** Set palm position before toggling — reserved for future transcript panel placement */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setPalmPosition(_x: number, _y: number) {
    // Reserved for future use
  }

  /** Toggle on if inactive, off if active */
  toggle() {
    if (this.active) {
      this.deactivate()
    } else {
      this.activate()
    }
  }

  async activate(): Promise<void> {
    if (this.active || !this.dispatch) return
    this.active = true

    const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY
    if (!apiKey) {
      console.warn('CIPHER: No Deepgram API key, interactive mode unavailable')
      this.active = false
      return
    }

    this.dispatch({ type: 'COMMAND_RECEIVED', text: '◈ INTERACTIVE MODE · LISTENING' })

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })

      this.socket = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true&interim_results=true&endpointing=300`,
        ['token', apiKey]
      )

      this.socket.onopen = () => {
        console.log('CIPHER: Deepgram connected')
        this.startStreaming()
        this.resetSilenceTimer()
      }

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (!data.channel?.alternatives?.[0]) return

        const transcript = data.channel.alternatives[0].transcript
        if (!transcript) return

        const isFinal = data.is_final

        if (this.dispatch) {
          const displayText = isFinal ? `◈ ${transcript}` : `◈ ${transcript}...`
          this.dispatch({ type: 'COMMAND_RECEIVED', text: displayText })
          this.dispatch({ type: 'UPDATE_TRANSCRIPT', text: isFinal ? transcript : transcript + '...' })
        }

        if (isFinal && transcript.trim().length > 0) {
          this.resetSilenceTimer()
          this.handleTranscript(transcript.trim())
        }
      }

      this.socket.onerror = (err) => {
        console.warn('CIPHER: Deepgram error:', err)
        this.deactivate()
      }

      this.socket.onclose = () => {
        console.log('CIPHER: Deepgram disconnected')
      }

    } catch (err) {
      console.warn('CIPHER: Failed to start interactive mode:', err)
      this.active = false
    }
  }

  private startStreaming() {
    if (!this.mediaStream || !this.socket) return

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType })

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(event.data)
      }
    }

    this.mediaRecorder.start(100)
  }

  private async handleTranscript(text: string) {
    if (!this.dispatch) return

    const cmd = parseCommand(text)
    if (cmd) {
      const response = executeCommand(cmd, this.dispatch)
      if (response) {
        // Show system response in transcript panel, then speak it
        this.dispatch({ type: 'UPDATE_SYSTEM_RESPONSE', text: response })
        await speak(response)
      }
      // Stay listening — do NOT deactivate after command
    } else {
      this.dispatch({ type: 'COMMAND_RECEIVED', text: `◈ "${text}" — not a command` })
      this.dispatch({ type: 'UPDATE_SYSTEM_RESPONSE', text: 'Listening...' })
    }
  }

  deactivate() {
    if (!this.active) return
    this.active = false

    this.mediaRecorder?.stop()
    this.mediaStream?.getTracks().forEach(t => t.stop())
    this.mediaRecorder = null
    this.mediaStream = null

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close()
    }
    this.socket = null

    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout)
      this.silenceTimeout = null
    }

    if (this.dispatch) {
      this.dispatch({ type: 'COMMAND_RECEIVED', text: '◈ INTERACTIVE MODE OFF' })
    }
  }

  private resetSilenceTimer() {
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout)
    this.silenceTimeout = window.setTimeout(() => {
      this.deactivate()
    }, this.SILENCE_MS)
  }

  destroy() {
    this.deactivate()
    this.dispatch = null
  }
}

export const interactiveMode = new InteractiveMode()
