// Esecuzione di una sequenza di posizioni: scrive l'obiettivo, rilegge la
// posizione finché è entro la tolleranza (o scade il tempo), poi passa alla
// successiva. Interrompibile in qualsiasi momento con un AbortSignal.

import { TimeoutError } from './connection'
import { isWithinTolerance } from './position'
import type { Reading } from './servo'
import { sleep } from './timing'

/** Il minimo che serve: lo implementa Servo, e in futuro ogni giunto del braccio. */
export interface PositionActuator {
  writeGoalPosition(position: number): Promise<Reading<number>>
  readPosition(): Promise<Reading<number>>
}

export const SEQUENCE_POLL_MS = 50
export const SEQUENCE_ARRIVAL_TIMEOUT_MS = 3000

export type StepOutcome =
  | { kind: 'arrived'; position: number; elapsedMs: number }
  | { kind: 'timeout'; position: number | null; elapsedMs: number }

export type SequenceEvent =
  | { type: 'step'; index: number; target: number }
  | { type: 'status'; index: number; status: number }
  | { type: 'position'; index: number; target: number; position: number }
  | { type: 'done'; index: number; target: number; outcome: StepOutcome }

export interface SequenceOptions {
  signal: AbortSignal
  onEvent?: (event: SequenceEvent) => void
  pollMs?: number
  arrivalTimeoutMs?: number
  now?: () => number
}

/** Restituisce 'completed' o 'aborted'. Gli errori diversi dal timeout di lettura vengono propagati. */
export async function runSequence(
  actuator: PositionActuator,
  positions: readonly number[],
  options: SequenceOptions,
): Promise<'completed' | 'aborted'> {
  const {
    signal,
    onEvent = () => undefined,
    pollMs = SEQUENCE_POLL_MS,
    arrivalTimeoutMs = SEQUENCE_ARRIVAL_TIMEOUT_MS,
    now = () => performance.now(),
  } = options

  for (let index = 0; index < positions.length; index++) {
    if (signal.aborted) return 'aborted'
    onEvent({ type: 'step', index, target: positions[index] })

    const written = await actuator.writeGoalPosition(positions[index])
    const target = written.value // valore effettivamente inviato (limitato a 0..4095)
    if (written.status !== 0) onEvent({ type: 'status', index, status: written.status })

    const started = now()
    let last: number | null = null
    let arrived = false
    while (!signal.aborted && now() - started < arrivalTimeoutMs) {
      if (!(await sleep(pollMs, signal))) break
      try {
        const reading = await actuator.readPosition()
        if (signal.aborted) break
        last = reading.value
        if (reading.status !== 0) onEvent({ type: 'status', index, status: reading.status })
        onEvent({ type: 'position', index, target, position: last })
        if (isWithinTolerance(target, last)) {
          arrived = true
          break
        }
      } catch (err) {
        if (!(err instanceof TimeoutError)) throw err // un timeout sporadico non ferma la sequenza
      }
    }
    if (signal.aborted) return 'aborted'

    const elapsedMs = now() - started
    const outcome: StepOutcome =
      arrived && last !== null
        ? { kind: 'arrived', position: last, elapsedMs }
        : { kind: 'timeout', position: last, elapsedMs }
    onEvent({ type: 'done', index, target, outcome })
  }
  return 'completed'
}
