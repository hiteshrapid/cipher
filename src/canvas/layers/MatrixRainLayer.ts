// CIPHER — MatrixRainLayer
// Animated Matrix-style falling character rain — green phosphor glyphs
// Respects AlertLevel: subtle in NORMAL, intense in ALERT/CRITICAL

import type { AlertLevel } from './RingLayer'

// Katakana + ASCII mix for that classic look
const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF'

interface Column {
  x:       number   // pixel x
  y:       number   // current head position (pixels)
  speed:   number   // pixels per ms
  length:  number   // glyph trail length
  chars:   string[] // current glyph values
  opacity: number   // column base opacity
}

export interface MatrixRainOptions {
  /** Character cell size in px (default 14) */
  fontSize?: number
  /** 0–1 overall opacity multiplier on top of alert scaling (default 1) */
  opacity?: number
  /** Speed multiplier (default 1) */
  speedScale?: number
}

// Per-AlertLevel config
const LEVEL_CONFIG: Record<AlertLevel, { opacity: number; density: number; speedScale: number }> = {
  NORMAL:   { opacity: 0.30, density: 0.55, speedScale: 0.85 },
  ALERT:    { opacity: 0.38, density: 0.75, speedScale: 1.3 },
  CRITICAL: { opacity: 0.60, density: 1.0,  speedScale: 2.0 },
}

export class MatrixRainLayer {
  private columns: Column[] = []
  private lastTick = 0
  private w = 0
  private h = 0
  private fontSize: number
  private opacityMult: number
  private speedScale: number
  private level: AlertLevel = 'NORMAL'

  constructor(opts: MatrixRainOptions = {}) {
    this.fontSize    = opts.fontSize    ?? 14
    this.opacityMult = opts.opacity     ?? 1
    this.speedScale  = opts.speedScale  ?? 1
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  setAlertLevel(level: AlertLevel) {
    this.level = level
  }

  /** Call once when canvas dimensions are known or change */
  resize(w: number, h: number) {
    this.w = w
    this.h = h
    this._initColumns()
  }

  /** Draw one frame. Call from render loop with performance.now() */
  draw(ctx: CanvasRenderingContext2D, t: number) {
    const cfg = LEVEL_CONFIG[this.level]
    if (cfg.opacity <= 0) return

    const dt = this.lastTick === 0 ? 16 : Math.min(t - this.lastTick, 50)
    this.lastTick = t

    this._tick(dt, cfg.speedScale)
    this._render(ctx, cfg.opacity)
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private _initColumns() {
    const cfg      = LEVEL_CONFIG[this.level]
    const colCount = Math.floor(this.w / this.fontSize)
    const maxCols  = Math.round(colCount * cfg.density)

    this.columns = []

    // Pick random subset of column positions
    const allX = Array.from({ length: colCount }, (_, i) => i * this.fontSize)
    shuffle(allX)

    for (let i = 0; i < maxCols; i++) {
      const length = randInt(8, 28)
      this.columns.push({
        x:       allX[i],
        y:       -randFloat(0, this.h),       // stagger initial positions
        speed:   randFloat(60, 160) * this.speedScale,
        length,
        chars:   Array.from({ length }, () => randomChar()),
        opacity: randFloat(0.4, 1.0),
      })
    }
  }

  private _tick(dt: number, levelSpeedScale: number) {
    const dtSec = dt / 1000
    for (const col of this.columns) {
      col.y += col.speed * this.speedScale * levelSpeedScale * dtSec

      // Randomly mutate a character in the trail each ~3 frames
      if (Math.random() < 0.33) {
        const idx = randInt(0, col.chars.length - 1)
        col.chars[idx] = randomChar()
      }

      // Recycle column once it's scrolled fully off bottom
      if (col.y - col.length * this.fontSize > this.h) {
        col.y      = -randFloat(this.fontSize * 2, this.fontSize * 10)
        col.speed  = randFloat(60, 160) * this.speedScale
        col.length = randInt(8, 28)
        col.chars  = Array.from({ length: col.length }, () => randomChar())
        col.opacity = randFloat(0.4, 1.0)
      }
    }
  }

  private _render(ctx: CanvasRenderingContext2D, levelOpacity: number) {
    const baseAlpha = levelOpacity * this.opacityMult
    ctx.save()
    ctx.font = `${this.fontSize}px 'Courier New', Courier, monospace`
    ctx.textBaseline = 'top'
    ctx.textAlign    = 'left'

    for (const col of this.columns) {
      const trailLen = col.length
      for (let i = 0; i < trailLen; i++) {
        const charY = col.y - i * this.fontSize

        // Clip to canvas
        if (charY < -this.fontSize || charY > this.h) continue

        // Head glyph: bright white-green
        // Trail glyphs: fade with distance from head
        const isHead = i === 0
        const fade   = isHead ? 1 : Math.pow(1 - i / trailLen, 2.2)
        const alpha  = baseAlpha * col.opacity * fade

        if (alpha < 0.01) continue

        if (isHead) {
          ctx.shadowBlur  = 10
          ctx.shadowColor = '#00ff41'
          ctx.fillStyle   = `rgba(200, 255, 220, ${alpha})`
        } else {
          ctx.shadowBlur  = 0
          ctx.shadowColor = 'transparent'
          const green = Math.round(180 * fade + 40)
          ctx.fillStyle = `rgba(0, ${green}, 30, ${alpha})`
        }

        ctx.fillText(col.chars[i] ?? randomChar(), col.x, charY)
      }
    }

    ctx.shadowBlur  = 0
    ctx.shadowColor = 'transparent'
    ctx.restore()
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)]
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
