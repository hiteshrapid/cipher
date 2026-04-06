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

  // Search / lookup commands — extract query after trigger phrase
  const searchMatch = t.match(
    /^(?:search(?:\s+for)?|find|look up|what(?:'s|\s+is)\s+(?:a\s+)?|tell me about|show me|who\s+is)\s+(.+)/
  )
  if (searchMatch) {
    return { action: 'search', query: searchMatch[1].trim(), raw: t }
  }

  for (const [alias, widgetId] of Object.entries(WIDGET_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(t)) {
      if (/^(show|open|bring up|display|pull up|get)/.test(t)) {
        return { action: 'show', target: widgetId, raw: t }
      }
      if (/^(hide|close|dismiss|remove|clear)/.test(t)) {
        return { action: 'hide', target: widgetId, raw: t }
      }
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
    case 'search':
      if (cmd.query) {
        dispatch({ type: 'SEARCH_QUERY', query: cmd.query })
        dispatch({ type: 'COMMAND_RECEIVED', text: `◈ searching: ${cmd.query}` })
      }
      break
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

export class VoiceEngine {
  private recognition: AnySpeechRecognition = null
  private dispatch: Dispatch | null = null
  private active = false
  private wakeWordDetected = false
  private wakeWordTimeout = 0
  private wakeWordRequired = false

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
      const t = transcript.toLowerCase()

      // Wake word detection
      if (/\b(hey\s+)?cipher\b/.test(t)) {
        this.wakeWordDetected = true
        clearTimeout(this.wakeWordTimeout)
        this.wakeWordTimeout = window.setTimeout(() => {
          this.wakeWordDetected = false
        }, 8000)

        // Handle inline command after "cipher" in the same utterance
        const afterCipher = t.replace(/^.*\b(hey\s+)?cipher\b\s*/, '').trim()
        if (afterCipher) {
          const inlineCmd = parseCommand(afterCipher)
          if (inlineCmd && this.dispatch) {
            executeCommand(inlineCmd, this.dispatch)
            return
          }
        }

        if (this.dispatch) {
          this.dispatch({ type: 'COMMAND_RECEIVED', text: '◈ CIPHER ONLINE · AWAITING COMMAND' })
        }
        return
      }

      // Process command: allowed if wake word active OR wake word not required (v1 behaviour)
      if (this.wakeWordDetected || !this.wakeWordRequired) {
        const cmd = parseCommand(transcript)
        if (cmd && this.dispatch) {
          executeCommand(cmd, this.dispatch)
        }
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

  setWakeWordRequired(required: boolean): void {
    this.wakeWordRequired = required
    if (!required) {
      // reset state when disabling strict mode
      this.wakeWordDetected = false
      clearTimeout(this.wakeWordTimeout)
    }
  }

  destroy() {
    this.stop()
    clearTimeout(this.wakeWordTimeout)
    this.recognition = null
    this.dispatch    = null
  }
}

// Suppress unused type warning — GestureType is re-exported for engine parity
export type { GestureType }
