// Confronto tra posizione obiettivo e posizione letta.

import { POSITION_MAX, POSITION_TOLERANCE, POSITION_UNITS_PER_TURN } from './registers'

export type PositionVerdict = 'exact' | 'tolerated' | 'far'

export interface PositionComparison {
  /** Differenza con segno (letta - obiettivo), sul percorso più corto del cerchio. */
  diff: number
  verdict: PositionVerdict
  /** true se la lettura è a fine corsa mentre l'obiettivo no: tipico dei byte invertiti. */
  atEndStop: boolean
}

// Margine per considerare una lettura "a fine corsa".
const END_STOP_MARGIN = 20

/**
 * 0 e 4095 sono adiacenti sul cerchio (4095 ≈ 359,9°), quindi la differenza si
 * calcola sul percorso più corto: obiettivo 0 e lettura 4095 differiscono di 1.
 */
export function positionDiff(target: number, actual: number): number {
  let diff = (actual - target) % POSITION_UNITS_PER_TURN
  if (diff > POSITION_UNITS_PER_TURN / 2) diff -= POSITION_UNITS_PER_TURN
  if (diff < -POSITION_UNITS_PER_TURN / 2) diff += POSITION_UNITS_PER_TURN
  return diff
}

export function comparePosition(target: number, actual: number): PositionComparison {
  const diff = positionDiff(target, actual)
  const abs = Math.abs(diff)
  const verdict: PositionVerdict = abs === 0 ? 'exact' : abs <= POSITION_TOLERANCE ? 'tolerated' : 'far'
  const nearEnd = (v: number) => v <= END_STOP_MARGIN || v >= POSITION_MAX - END_STOP_MARGIN
  return { diff, verdict, atEndStop: verdict === 'far' && nearEnd(actual) && !nearEnd(target) }
}

export function isWithinTolerance(target: number, actual: number): boolean {
  return Math.abs(positionDiff(target, actual)) <= POSITION_TOLERANCE
}
