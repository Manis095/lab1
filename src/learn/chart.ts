// Calcoli geometrici per i piccoli grafici e il quadrante. Funzioni pure.

import { POSITION_UNITS_PER_TURN } from '../serial/registers'

export interface Point {
  t: number
  v: number
}

/** Tacche "tonde" da 0 a un massimo che contiene `max` (1, 2, 5 × 10^n). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

export interface Frame {
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
}

/** Tracciato SVG di una serie; asse x dal primo all'ultimo campione. */
export function linePath(points: Point[], frame: Frame, yMax: number): string {
  if (points.length === 0) return ''
  const t0 = points[0].t
  const span = Math.max(1, points[points.length - 1].t - t0)
  return points
    .map((p, i) => {
      const x = xOf(p.t, t0, span, frame)
      const y = yOf(p.v, yMax, frame)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function xOf(t: number, t0: number, span: number, frame: Frame): number {
  const inner = frame.width - frame.left - frame.right
  return frame.left + ((t - t0) / span) * inner
}

export function yOf(v: number, yMax: number, frame: Frame): number {
  const inner = frame.height - frame.top - frame.bottom
  const clamped = Math.min(Math.max(v, 0), yMax)
  return frame.top + inner - (clamped / yMax) * inner
}

/** Indice del campione più vicino a una x in pixel (per il mirino). */
export function nearestIndex(points: Point[], x: number, frame: Frame): number {
  if (points.length === 0) return -1
  const t0 = points[0].t
  const span = Math.max(1, points[points.length - 1].t - t0)
  let best = 0
  let bestDist = Infinity
  points.forEach((p, i) => {
    const d = Math.abs(xOf(p.t, t0, span, frame) - x)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}

/**
 * Angolo sul quadrante in gradi, 0 in alto e senso orario: è solo una
 * convenzione del disegno, non il verso di rotazione reale del servo.
 */
export function positionToDialAngle(position: number): number {
  return (position / POSITION_UNITS_PER_TURN) * 360
}

/** Punto sulla circonferenza per un angolo del quadrante. */
export function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
