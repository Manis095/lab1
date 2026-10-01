import { type PointerEvent, useState } from 'react'
import { type Frame, type Point, steppedPoints, xOf, yOf } from '../learn/chart'
import { POSITION_MAX } from '../serial/registers'

interface Props {
  /** Cambi di obiettivo (istante della scrittura, valore). */
  targets: Point[]
  /** Posizioni lette durante la sequenza. */
  positions: Point[]
}

const FRAME: Frame = { width: 560, height: 190, left: 44, right: 12, top: 10, bottom: 24 }
const TICKS = [0, 1024, 2048, 3072, POSITION_MAX]

/**
 * Posizione letta e obiettivo nel tempo, sullo stesso asse (stessa unità).
 * Due serie: legenda sempre presente, e tratti diversi oltre al colore.
 */
export function SequenceChart({ targets, positions }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  if (targets.length === 0) return null

  const t0 = targets[0].t
  const tEnd = Math.max(positions.at(-1)?.t ?? t0, targets.at(-1)!.t)
  const span = Math.max(1, tEnd - t0)
  const stepped = steppedPoints(targets, tEnd)
  const hovered = hover !== null ? positions[hover] : null
  const targetAt = (t: number) => [...targets].reverse().find((c) => c.t <= t)?.v

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * FRAME.width
    // Lettura più vicina al puntatore, sullo stesso asse x del disegno.
    let best = -1
    let bestDist = Infinity
    positions.forEach((p, i) => {
      const d = Math.abs(xOf(p.t, t0, span, FRAME) - x)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    setHover(best >= 0 ? best : null)
  }

  return (
    <figure className="chart">
      <figcaption>
        <span>Posizione nel tempo</span>
        <span className="chart-legend">
          <span>
            <svg width="26" height="10" aria-hidden="true">
              <line className="series-target" x1="0" y1="5" x2="26" y2="5" />
            </svg>
            obiettivo
          </span>
          <span>
            <svg width="26" height="10" aria-hidden="true">
              <line className="series-position" x1="0" y1="5" x2="26" y2="5" />
            </svg>
            posizione letta
          </span>
        </span>
      </figcaption>
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
          role="img"
          aria-label={`Posizione nel tempo: ${targets.length} obiettivi, ${positions.length} letture`}
          onPointerMove={positions.length > 0 ? handleMove : undefined}
          onPointerLeave={() => setHover(null)}
        >
          {TICKS.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={FRAME.left} x2={FRAME.width - FRAME.right} y1={yOf(t, POSITION_MAX, FRAME)} y2={yOf(t, POSITION_MAX, FRAME)} />
              <text className="chart-tick" x={FRAME.left - 6} y={yOf(t, POSITION_MAX, FRAME) + 4}>
                {t}
              </text>
            </g>
          ))}
          <text className="chart-tick chart-tick-x" x={FRAME.left} y={FRAME.height - 6}>
            0 s
          </text>
          <text className="chart-tick chart-tick-x end" x={FRAME.width - FRAME.right} y={FRAME.height - 6}>
            {(span / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} s
          </text>
          <path className="series-target" d={pathOf(stepped, t0, span)} />
          <path className="series-position" d={pathOf(positions, t0, span)} />
          {hovered && (
            <g>
              <line
                className="chart-crosshair"
                x1={xOf(hovered.t, t0, span, FRAME)}
                x2={xOf(hovered.t, t0, span, FRAME)}
                y1={FRAME.top}
                y2={FRAME.height - FRAME.bottom}
              />
              <circle className="series-dot" cx={xOf(hovered.t, t0, span, FRAME)} cy={yOf(hovered.v, POSITION_MAX, FRAME)} r={5} />
            </g>
          )}
        </svg>
        {hovered && (
          <div className="chart-tooltip" style={{ left: `${(xOf(hovered.t, t0, span, FRAME) / FRAME.width) * 100}%` }}>
            <strong>{hovered.v}</strong>
            <span>obiettivo {targetAt(hovered.t) ?? '?'}</span>
            <span>{((hovered.t - t0) / 1000).toLocaleString('it-IT', { maximumFractionDigits: 2 })} s</span>
          </div>
        )}
      </div>
    </figure>
  )
}

/** Tracciato con asse x fissato a [t0, t0 + span]. */
function pathOf(points: Point[], t0: number, span: number): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(p.t, t0, span, FRAME).toFixed(1)},${yOf(p.v, POSITION_MAX, FRAME).toFixed(1)}`)
    .join(' ')
}
