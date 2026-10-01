import { polar, positionToDialAngle } from '../learn/chart'
import { positionDiff } from '../serial/position'
import { POSITION_TOLERANCE, positionToDegrees } from '../serial/registers'

interface Props {
  /** Valore scelto con slider o campo, non ancora inviato. */
  preview: number
  /** Ultimo obiettivo inviato. */
  target: number | null
  /** Ultima posizione letta. */
  actual: number | null
}

const SIZE = 260
const C = SIZE / 2
const R = 100
const MARKS = [0, 1024, 2048, 3072]

const deg = (p: number) => `${positionToDegrees(p).toLocaleString('it-IT', { maximumFractionDigits: 1 })}°`

function Needle({ position, className, length }: { position: number; className: string; length: number }) {
  const end = polar(C, C, length, positionToDialAngle(position))
  return (
    <g className={className}>
      <line x1={C} y1={C} x2={end.x} y2={end.y} />
      <circle cx={end.x} cy={end.y} r={5} />
    </g>
  )
}

/**
 * Quadrante: dove andrà il servo (valore scelto), dove gli abbiamo detto di
 * andare (obiettivo inviato) e dove dice di essere (lettura). Ogni lancetta ha
 * un tratto diverso, non solo un colore diverso.
 */
export function PositionDial({ preview, target, actual }: Props) {
  const diff = target !== null && actual !== null ? positionDiff(target, actual) : null
  const actualClass =
    diff === null ? 'needle-actual' : Math.abs(diff) <= POSITION_TOLERANCE ? 'needle-actual' : 'needle-actual needle-far'

  return (
    <div className="dial-block">
      <svg
        className="dial"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Quadrante: scelto ${preview}${target !== null ? `, obiettivo ${target}` : ''}${actual !== null ? `, letto ${actual}` : ''}`}
      >
        <circle className="dial-face" cx={C} cy={C} r={R} />
        {Array.from({ length: 16 }, (_, i) => {
          const angle = i * 22.5
          const major = i % 4 === 0
          const a = polar(C, C, R, angle)
          const b = polar(C, C, R - (major ? 12 : 6), angle)
          return <line key={i} className={major ? 'dial-tick major' : 'dial-tick'} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
        {MARKS.map((m) => {
          const p = polar(C, C, R + 16, positionToDialAngle(m))
          return (
            <text key={m} className="dial-label" x={p.x} y={p.y + 4}>
              {m}
            </text>
          )
        })}
        <Needle position={preview} className="needle-preview" length={R - 18} />
        {target !== null && <Needle position={target} className="needle-target" length={R - 8} />}
        {actual !== null && <Needle position={actual} className={actualClass} length={R - 26} />}
        <circle className="dial-hub" cx={C} cy={C} r={6} />
      </svg>

      <div className="dial-side">
        <ul className="dial-legend">
          <li>
            <svg width="30" height="10" aria-hidden="true">
              <line className="key needle-preview" x1="0" y1="5" x2="30" y2="5" />
            </svg>
            <span>
              Scelto: <strong>{preview}</strong> = {deg(preview)}
            </span>
          </li>
          <li>
            <svg width="30" height="10" aria-hidden="true">
              <line className="key needle-target" x1="0" y1="5" x2="30" y2="5" />
            </svg>
            <span>
              Obiettivo inviato: <strong>{target ?? 'nessuno'}</strong>
              {target !== null && ` = ${deg(target)}`}
            </span>
          </li>
          <li>
            <svg width="30" height="10" aria-hidden="true">
              <line className={`key ${actualClass}`} x1="0" y1="5" x2="30" y2="5" />
            </svg>
            <span>
              Letto: <strong>{actual ?? 'non ancora'}</strong>
              {actual !== null && ` = ${deg(actual)}`}
            </span>
          </li>
        </ul>
        {diff !== null && <ToleranceBar diff={diff} />}
        <p className="note">0 in alto e senso orario: è solo una convenzione del disegno.</p>
      </div>
    </div>
  )
}

const RANGE = 10

/** Ingrandimento della differenza: sul quadrante 2 unità (0,18°) non si vedono. */
function ToleranceBar({ diff }: { diff: number }) {
  const outside = Math.abs(diff) > RANGE
  const clamped = Math.max(-RANGE, Math.min(RANGE, diff))
  const x = (v: number) => 10 + ((v + RANGE) / (2 * RANGE)) * 220
  const ok = Math.abs(diff) <= POSITION_TOLERANCE
  return (
    <figure className="tolerance">
      <figcaption>
        Differenza letto − obiettivo: <strong>{diff > 0 ? `+${diff}` : diff}</strong>{' '}
        {ok ? <span className="badge ok">entro ±{POSITION_TOLERANCE}</span> : <span className="badge alarm">fuori tolleranza</span>}
      </figcaption>
      <svg viewBox="0 0 240 46" role="img" aria-label={`Differenza ${diff} unità su una scala da -${RANGE} a +${RANGE}`}>
        <line className="tol-axis" x1={x(-RANGE)} y1="20" x2={x(RANGE)} y2="20" />
        <rect className="tol-band" x={x(-POSITION_TOLERANCE)} y="12" width={x(POSITION_TOLERANCE) - x(-POSITION_TOLERANCE)} height="16" rx="3" />
        {[-RANGE, -POSITION_TOLERANCE, 0, POSITION_TOLERANCE, RANGE].map((v) => (
          <g key={v}>
            <line className="tol-tick" x1={x(v)} y1="28" x2={x(v)} y2="32" />
            <text className="tol-label" x={x(v)} y="43">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        <g className={ok ? 'tol-marker' : 'tol-marker tol-far'}>
          <circle cx={x(clamped)} cy="20" r="6" />
          {outside && (
            <text className="tol-label" x={x(clamped) + (diff > 0 ? -14 : 14)} y="9">
              {diff > 0 ? '→' : '←'}
            </text>
          )}
        </g>
      </svg>
      {outside && <p className="note">Fuori scala: la scala mostra solo ±{RANGE} unità.</p>}
    </figure>
  )
}
