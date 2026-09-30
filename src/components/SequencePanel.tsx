import { useEffect, useRef, useState } from 'react'
import { clampPosition, POSITION_MAX, POSITION_MIN, POSITION_TOLERANCE } from '../serial/registers'
import {
  runSequence,
  SEQUENCE_ARRIVAL_TIMEOUT_MS,
  type SequenceEvent,
  type StepOutcome,
} from '../serial/sequence'
import type { Servo } from '../serial/servo'
import { describeError } from './errors'
import { StepCard } from './StepCard'

// Differenze grandi per vedere bene il movimento.
const DEFAULT_SEQUENCE = [1024, 3072, 2048, 512, 2048]

interface Step {
  key: number
  value: string
}

let stepKey = 0
const toSteps = (values: number[]): Step[] => values.map((v) => ({ key: stepKey++, value: String(v) }))

interface Props {
  servo: Servo
  connected: boolean
}

/** Passo 4: sequenza di posizioni con attesa dell'arrivo e interruzione immediata. */
export function SequencePanel({ servo, connected }: Props) {
  const [steps, setSteps] = useState<Step[]>(() => toSteps(DEFAULT_SEQUENCE))
  const [repeat, setRepeat] = useState(false)
  const [running, setRunning] = useState(false)
  const [current, setCurrent] = useState<number | null>(null)
  const [livePosition, setLivePosition] = useState<number | null>(null)
  const [outcomes, setOutcomes] = useState<Record<number, StepOutcome>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  function update(index: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, value } : s)))
  }

  function remove(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }

  function handleEvent(event: SequenceEvent) {
    switch (event.type) {
      case 'step':
        setCurrent(event.index)
        setLivePosition(null)
        setOutcomes((prev) => {
          const next = { ...prev }
          delete next[event.index]
          return next
        })
        break
      case 'position':
        setLivePosition(event.position)
        break
      case 'status':
        setError(`Il servo segnala stato ${event.status.toString(16).toUpperCase().padStart(2, '0')} (vedi log)`)
        break
      case 'done':
        setOutcomes((prev) => ({ ...prev, [event.index]: event.outcome }))
        break
    }
  }

  async function start() {
    const positions = steps.map((s) => clampPosition(Number(s.value)))
    if (positions.length === 0) return
    setSteps(toSteps(positions)) // mostra i valori effettivamente usati
    const controller = new AbortController()
    controllerRef.current = controller
    setRunning(true)
    setOutcomes({})
    setMessage(null)
    setError(null)
    try {
      let result: 'completed' | 'aborted'
      do {
        result = await runSequence(servo, positions, { signal: controller.signal, onEvent: handleEvent })
      } while (repeat && result === 'completed' && !controller.signal.aborted)
      setMessage(result === 'completed' ? 'Sequenza completata.' : 'Sequenza interrotta.')
    } catch (err) {
      setError(describeError(err))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setRunning(false)
      setCurrent(null)
    }
  }

  function stop() {
    controllerRef.current?.abort()
  }

  useEffect(() => {
    if (!connected) controllerRef.current?.abort()
  }, [connected])
  useEffect(() => () => controllerRef.current?.abort(), [])

  return (
    <StepCard id="passo-4" topic="step4" number={4} title="Sequenza di posizioni">
      <ol className="sequence">
        {steps.map((step, index) => {
          const outcome = outcomes[index]
          return (
            <li key={step.key} className={index === current ? 'active' : ''}>
              <input
                type="number"
                aria-label={`Posizione ${index + 1}`}
                min={POSITION_MIN}
                max={POSITION_MAX}
                value={step.value}
                disabled={running}
                onChange={(e) => update(index, e.target.value)}
              />
              <button type="button" onClick={() => remove(index)} disabled={running} aria-label="Rimuovi">
                ×
              </button>
              {index === current && (
                <span className="note">
                  in corso{livePosition !== null && `: posizione ${livePosition}`}
                </span>
              )}
              {outcome?.kind === 'arrived' && (
                <span className="badge ok">
                  arrivato a {outcome.position} in {Math.round(outcome.elapsedMs)} ms
                </span>
              )}
              {outcome?.kind === 'timeout' && (
                <span className="badge alarm">
                  non arrivato entro {SEQUENCE_ARRIVAL_TIMEOUT_MS / 1000} s (ultima lettura{' '}
                  {outcome.position ?? 'nessuna'})
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="row">
        <button type="button" onClick={() => setSteps((prev) => [...prev, ...toSteps([2048])])} disabled={running}>
          Aggiungi
        </button>
        <button type="button" onClick={() => setSteps(toSteps(DEFAULT_SEQUENCE))} disabled={running}>
          Ripristina esempio
        </button>
        <label>
          <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} disabled={running} />{' '}
          ripeti
        </label>
      </div>
      <div className="row">
        <button
          type="button"
          className={running ? '' : 'primary'}
          onClick={running ? stop : start}
          disabled={!running && (!connected || steps.length === 0)}
        >
          {running ? 'Ferma' : 'Avvia'}
        </button>
        {message && <span className="note">{message}</span>}
      </div>
      <p className="note">
        Per ogni posizione: scrive l'obiettivo, rilegge finché è entro ±{POSITION_TOLERANCE} (massimo{' '}
        {SEQUENCE_ARRIVAL_TIMEOUT_MS / 1000} s), poi passa alla successiva. "Ferma" smette subito di inviare
        comandi: il servo completa il movimento verso l'ultimo obiettivo già scritto.
      </p>
      {error && <p className="error">{error}</p>}
    </StepCard>
  )
}
