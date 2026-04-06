// CIPHER — VoiceEngine
// Web Speech API continuous recognition → parsed HUD commands

import type { WidgetId, ParsedCommand, GestureType } from '../types'
import type { HUDAction } from '../types'

type Dispatch = (action: HUDAction) => void

// Map spoken words → widget IDs
const WIDGET_ALIASES: Record<string, WidgetId> = {
  sprint:  'sprint',
  issues:  'issues',
  tickets: 'issues',
  jira:    'sprint',
  tasks:   'issues',
  board:   'sprint',
}

// Parse a transcript string into a command
function parseCommand(transcript: string): ParsedCommand | null {
  const t = transcript.toLowerCase().trim()

  if (/hide all|clear all|reset|close all/.test(t)) {
    return { action: 'hideAll', raw: t }
  }
  if (/refresh|reload|update|sync/.test(t)) {
    return { action: 'refresh', raw: t }
  }

  for (const [alias, widgetId] of Object.entries(WIDGET_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(t)) {
      if (/^(show|open|bring up|display|pull up|get)/.test(t)) {
        return { action: 'show', target: widgetId, raw: t }
      }
      if (/^(hide|close|dismiss|remove|clear)/.test(t)) {
        return { action: 'hide', target: widgetId, raw: t }
      }
      // If just the widget name is said, toggle show
      return { action: 'show', target: widgetId, raw: t }
    }
  }

  return null
}

// Map command → HUD actions
function executeCommand(cmd: ParsedCommand, dispatch: Dispatch) {
  dispatch({ type: 'COMMAND_RECEIVED', text: cmd.raw })

  switch (cmd.action) {
    case 'show':
      if (cmd.target) dispatch({ type: 'SHOW_WIDGET', id: cmd.target })
      break
    case 'hide':
      if (cmd.target) dispatch({ type: 'HIDE_WIDGET', id: cmd.target })
      break
    case 'hideAll':
      dispatch({ type: 'HIDE_ALL' })
      break
    case 'refresh':
      // Registry refresh is handled by the component listening to this action
      dispatch({ type: 'COMMAND_RECEIVED', text: '↺ refreshing connectors' })
      break
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

export class VoiceEngine {
  private recognition: AnySpeechRecognition = null
  private dispatch: Dispatch | null = null
  private active = false

  init(dispatch: Dispatch): boolean {
    this.dispatch = dispatch

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition
    if (!SR) {
      console.warn('CIPHER: Web Speech API not supported in this browser')
      return false
    }

    const r = new SR()
    r.continuous     = true
    r.interimResults = false
    r.lang           = 'en-US'
    r.maxAlternatives = 1

    r.onresult = (e: SpeechRecognitionEvent) => {
      const last = e.results[e.results.length - 1]
      if (!last.isFinal) return
      const transcript = last[0].transcript.trim()
      const cmd = parseCommand(transcript)
      if (cmd && this.dispatch) {
        executeCommand(cmd, this.dispatch)
      }
    }

    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('CIPHER VoiceEngine error:', e.error)
      }
    }

    r.onend = () => {
      // Auto-restart to keep listening
      if (this.active) {
        try { r.start() } catch { /* ignore */ }
      }
    }

    this.recognition = r
    return true
  }

  start() {
    if (!this.recognition || this.active) return
    this.active = true
    try { this.recognition.start() } catch { /* ignore if already started */ }
  }

  stop() {
    this.active = false
    try { this.recognition?.stop() } catch { /* ignore */ }
  }

  destroy() {
    this.stop()
    this.recognition = null
    this.dispatch    = null
  }
}

// Suppress unused type warning — GestureType is re-exported for engine parity
export type { GestureType }
