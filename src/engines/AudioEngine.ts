// CIPHER — AudioEngine
// Web Speech Synthesis (TTS) + Web Audio API tones + mic waveform analyser

export type SoundType = 'summon' | 'dismiss' | 'confirm' | 'alert' | 'error' | 'refresh' | 'boot'

export class AudioEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private synth: SpeechSynthesis = (window as any).speechSynthesis
  private selectedVoice: SpeechSynthesisVoice | null = null
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private micStream: MediaStream | null = null
  private waveformBuffer: Uint8Array<ArrayBuffer> = new Uint8Array(256) as Uint8Array<ArrayBuffer>

  // ─── Init ─────────────────────────────────────────────────────────────────────
  init(): void {
    const pickVoice = () => {
      const voices = this.synth.getVoices()
      if (voices.length === 0) return

      const googleVoice  = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
      const danielVoice  = voices.find(v => v.name.includes('Daniel'))
      const samanthaVoice = voices.find(v => v.name.includes('Samantha'))
      const anyEnglish   = voices.find(v => v.lang.startsWith('en'))

      this.selectedVoice = googleVoice ?? danielVoice ?? samanthaVoice ?? anyEnglish ?? null
    }

    this.synth.onvoiceschanged = pickVoice
    pickVoice()  // run immediately for browsers that have voices synchronously

    // Unlock AudioContext on first user interaction (click/keydown/touch)
    // so TTS can play later without needing a DOM gesture
    const unlock = () => {
      if (!this.audioCtx) this.audioCtx = new AudioContext()
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {})
      }
      document.removeEventListener('click', unlock)
      document.removeEventListener('keydown', unlock)
      document.removeEventListener('touchstart', unlock)
    }
    document.addEventListener('click', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    document.addEventListener('touchstart', unlock, { once: true })
  }

  // ─── Lazy AudioContext (with suspend recovery) ────────────────────────────────
  private getAudioCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext()
    }
    // Best-effort resume for tone playback (fire-and-forget)
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  /** Shared context for external consumers (e.g. InteractiveMode TTS).
   *  Ensures the context is running before returning. */
  async getSharedContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext()
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume()
    }
    return this.audioCtx
  }

  // ─── TTS ──────────────────────────────────────────────────────────────────────
  speak(text: string, priority: 'normal' | 'high' = 'normal'): void {
    if (!this.synth) return
    if (priority === 'high') this.synth.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = this.selectedVoice
    utterance.rate  = 1.1
    utterance.pitch = 0.9
    this.synth.speak(utterance)
  }

  // ─── Tones ────────────────────────────────────────────────────────────────────
  playSound(type: SoundType): void {
    try {
      switch (type) {
        case 'summon':  this.playSummon();  break
        case 'dismiss': this.playDismiss(); break
        case 'confirm': this.playConfirm(); break
        case 'alert':   this.playAlert();   break
        case 'error':   this.playError();   break
        case 'refresh': this.playRefresh(); break
        case 'boot':    this.playBoot();    break
      }
    } catch {
      // Ignore audio errors (e.g. suspended context, user hasn't interacted yet)
    }
  }

  // Helper: create a single tone node and return its gain for optional chaining
  private tone(
    startHz: number,
    endHz: number,
    wave: OscillatorType,
    startTime: number,
    duration: number,
    volume = 0.15,
  ): void {
    const ctx  = this.getAudioCtx()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = wave
    osc.frequency.setValueAtTime(startHz, startTime)
    if (endHz !== startHz) {
      osc.frequency.linearRampToValueAtTime(endHz, startTime + duration)
    }

    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.005)
    gain.gain.linearRampToValueAtTime(0, startTime + duration - 0.005)

    osc.start(startTime)
    osc.stop(startTime + duration)
  }

  private playSummon(): void {
    const now = this.getAudioCtx().currentTime
    this.tone(220, 440, 'sine', now, 0.30)
  }

  private playDismiss(): void {
    const now = this.getAudioCtx().currentTime
    this.tone(440, 220, 'sine', now, 0.25)
  }

  private playConfirm(): void {
    const now = this.getAudioCtx().currentTime
    this.tone(880, 880, 'sine', now,        0.15)
    this.tone(880, 880, 'sine', now + 0.17, 0.15)
  }

  private playAlert(): void {
    const now = this.getAudioCtx().currentTime
    this.tone(660, 660, 'sawtooth', now,        0.10)
    this.tone(660, 660, 'sawtooth', now + 0.12, 0.10)
    this.tone(660, 660, 'sawtooth', now + 0.24, 0.10)
  }

  private playError(): void {
    const now = this.getAudioCtx().currentTime
    this.tone(330, 220, 'square', now, 0.40)
  }

  private playRefresh(): void {
    const now = this.getAudioCtx().currentTime
    this.tone(200, 600, 'sine', now, 0.40)
  }

  private playBoot(): void {
    const now = this.getAudioCtx().currentTime
    this.tone(110, 110, 'sine', now + 0.0, 0.20)
    this.tone(220, 220, 'sine', now + 0.2, 0.20)
    this.tone(440, 440, 'sine', now + 0.4, 0.20)
    this.tone(880, 880, 'sine', now + 0.6, 0.20)
  }

  // ─── Mic analyser (for waveform visualisation) ────────────────────────────────
  async startMicAnalyser(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.micStream = stream

    const ctx    = this.getAudioCtx()
    const source = ctx.createMediaStreamSource(stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 512  // → 256 frequency bins
    source.connect(this.analyser)
    this.waveformBuffer = new Uint8Array(this.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
  }

  getWaveformData(): Uint8Array<ArrayBuffer> | null {
    if (!this.analyser) return null
    this.analyser.getByteFrequencyData(this.waveformBuffer)
    return this.waveformBuffer
  }

  stopMicAnalyser(): void {
    this.micStream?.getTracks().forEach(t => t.stop())
    this.analyser?.disconnect()
    this.micStream = null
    this.analyser  = null
  }

  // ─── Teardown ─────────────────────────────────────────────────────────────────
  destroy(): void {
    this.stopMicAnalyser()
    this.synth?.cancel()
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => { /* ignore */ })
      this.audioCtx = null
    }
  }
}

export const audioEngine = new AudioEngine()
