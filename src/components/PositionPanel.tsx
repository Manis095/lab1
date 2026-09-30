import { useState } from 'react'
import { comparePosition } from '../serial/position'
import { toHex, toLE16 } from '../serial/protocol'
import {
  clampPosition,
  POSITION_MAX,
  POSITION_MIN,
  POSITION_TOLERANCE,
  positionToDegrees,
  REG_GOAL_POSITION,
  REG_PRESENT_POSITION,
} from '../serial/registers'
import type { Servo } from '../serial/servo'
import { describeError } from './errors'
import { ExchangeView } from './ExchangeView'
import { StepCard } from './StepCard'
import { StatusBadge } from './StatusBadge'

interface Props {
  servo: Servo
  connected: boolean
}

const formatDegrees = (position: number) =>
  `${positionToDegrees(position).toLocaleString('it-IT', { maximumFractionDigits: 1 })}°`

/** Passo 2: scrittura della posizione obiettivo e lettura, con due bottoni separati. */
export function PositionPanel({ servo, connected }: Props) {
  const [input, setInput] = useState('2048')
  const [sent, setSent] = useState<{ value: number; status: number } | null>(null)
  const [read, setRead] = useState<{ value: number; status: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = clampPosition(Number(input))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  // "Vai" scrive soltanto: il motore non arriva subito, la lettura la decide l'utente.
  const handleGo = () =>
    run(async () => {
      setInput(String(target))
      setSent(await servo.writeGoalPosition(target))
      setRead(null)
    })

  const handleWhere = () =>
    run(async () => {
      setRead(await servo.readPosition())
    })

  const comparison = sent && read ? comparePosition(sent.value, read.value) : null

  return (
    <StepCard id="passo-2" topic="step2" number={2} title="Posizione">
      <div className="row">
        <label htmlFor="target">Obiettivo</label>
        <input
          id="target"
          type="number"
          min={POSITION_MIN}
          max={POSITION_MAX}
          step={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setInput(String(target))}
        />
        <input
          type="range"
          aria-label="Obiettivo"
          min={POSITION_MIN}
          max={POSITION_MAX}
          step={1}
          value={target}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>
      <p className="note">
        {target} = {formatDegrees(target)}, in little endian <code>{toHex(toLE16(target))}</code>{' '}
        (registro {REG_GOAL_POSITION}). Valori fuori da {POSITION_MIN}..{POSITION_MAX} vengono limitati.
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={handleGo} disabled={!connected || busy}>
          Vai
        </button>
        <button type="button" onClick={handleWhere} disabled={!connected || busy}>
          Dove sei
        </button>
      </div>

      {sent && (
        <p>
          Inviato obiettivo {sent.value} ({formatDegrees(sent.value)}) <StatusBadge status={sent.status} />
        </p>
      )}
      {read && (
        <p>
          Posizione letta (registro {REG_PRESENT_POSITION}): <strong>{read.value}</strong> ={' '}
          {formatDegrees(read.value)} <StatusBadge status={read.status} />
        </p>
      )}
      {comparison && sent && (
        <p>
          {comparison.verdict === 'exact' && <span className="badge ok">Esattamente sull'obiettivo</span>}
          {comparison.verdict === 'tolerated' && (
            <span className="badge ok">
              Differenza {comparison.diff > 0 ? '+' : ''}
              {comparison.diff}: tollerata (entro ±{POSITION_TOLERANCE}, gioco degli ingranaggi)
            </span>
          )}
          {comparison.verdict === 'far' && (
            <span className="badge alarm">
              Differenza {comparison.diff > 0 ? '+' : ''}
              {comparison.diff}: troppo grande.{' '}
              {comparison.atEndStop
                ? 'Il servo è a fine corsa: probabili byte invertiti (little endian!).'
                : 'Forse è ancora in movimento (premi di nuovo "Dove sei"); altrimenti controlla coppia abilitata, ostacoli e ordine dei byte.'}
            </span>
          )}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <ExchangeView keys={['goal', 'position']} emptyHint='Premi "Vai" o "Dove sei" per vedere i byte scambiati.' />
    </StepCard>
  )
}
