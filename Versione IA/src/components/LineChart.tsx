import { type PointerEvent, useState } from 'react'
import { type Frame, linePath, nearestIndex, niceTicks, type Point, xOf, yOf } from '../learn/chart'

interface Props {
  title: string
  points: Point[]
  /** Massimo fisso dell'asse y; se assente segue i dati. */
  yMax?: number
  format: (v: number) => string
  /** Riga aggiuntiva nel riquadro del valore (per esempio la direzione del carico). */
  detail?: (index: number) => string | undefined
}

const FRAME: Frame = { width: 560, height: 150, left: 44, right: 12, top: 10, bottom: 24 }

/**
 * Piccolo grafico a linea di una sola serie: il titolo dice cosa è tracciato,
 * quindi niente legenda. Mirino e valore al passaggio del puntatore.
 */
export function LineChart({ title, points, yMax, format, detail }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const dataMax = Math.max(0, ...points.map((p) => p.v))
  const ticks = niceTicks(yMax ?? Math.max(dataMax, 1))
  const top = ticks[ticks.length - 1]
  const last = points.at(-1)
  const t0 = points[0]?.t ?? 0
  const span = Math.max(1, (last?.t ?? 0) - t0)
  const seconds = span / 1000
  const hovered = hover !== null ? points[hover] : null

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * FRAME.width
    setHover(nearestIndex(points, x, FRAME))
  }

  return (
    <figure className="chart">
      <figcaption>
        <span>{title}</span>
        {last && <strong>{format(last.v)}</strong>}
      </figcaption>
      <div className="chart-plot">
        <svg
          viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
          role="img"
          aria-label={`${title}: ${points.length} campioni${last ? `, ultimo ${format(last.v)}` : ''}`}
          onPointerMove={points.length > 0 ? handleMove : undefined}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={FRAME.left} x2={FRAME.width - FRAME.right} y1={yOf(t, top, FRAME)} y2={yOf(t, top, FRAME)} />
              <text className="chart-tick" x={FRAME.left - 6} y={yOf(t, top, FRAME) + 4}>
                {t.toLocaleString('it-IT')}
              </text>
            </g>
          ))}
          <text className="chart-tick chart-tick-x" x={FRAME.left} y={FRAME.height - 6}>
            {points.length > 1 ? `-${seconds.toLocaleString('it-IT', { maximumFractionDigits: 1 })} s` : ''}
          </text>
          <text className="chart-tick chart-tick-x end" x={FRAME.width - FRAME.right} y={FRAME.height - 6}>
            ora
          </text>
          <path className="chart-line" d={linePath(points, FRAME, top)} />
          {last && <circle className="chart-dot" cx={xOf(last.t, t0, span, FRAME)} cy={yOf(last.v, top, FRAME)} r={4} />}
          {hovered && (
            <g>
              <line
                className="chart-crosshair"
                x1={xOf(hovered.t, t0, span, FRAME)}
                x2={xOf(hovered.t, t0, span, FRAME)}
                y1={FRAME.top}
                y2={FRAME.height - FRAME.bottom}
              />
              <circle className="chart-dot" cx={xOf(hovered.t, t0, span, FRAME)} cy={yOf(hovered.v, top, FRAME)} r={5} />
            </g>
          )}
        </svg>
        {hovered && hover !== null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(xOf(hovered.t, t0, span, FRAME) / FRAME.width) * 100}%`,
            }}
          >
            <strong>{format(hovered.v)}</strong>
            <span>{new Date(hovered.t).toLocaleTimeString('it-IT')}</span>
            {detail?.(hover) && <span>{detail(hover)}</span>}
          </div>
        )}
      </div>
      {points.length === 0 && <p className="note">Nessun campione: premi Avvia.</p>}
    </figure>
  )
}
