import { memo, useState } from 'react'
import { dissectPacket } from '../learn/anatomy'
import { fromHex } from '../learn/exchanges'
import type { TrafficEvent, TrafficKind } from '../serial/connection'

export interface LogEntry extends TrafficEvent {
  seq: number
}

export interface LogCounts {
  tx: number
  rx: number
  /** Risposte con byte di stato diverso da zero. */
  alarms: number
  timeouts: number
}

type Filter = 'tx' | 'rx' | 'notes'

const FILTER_LABELS: Record<Filter, string> = { tx: 'TX', rx: 'RX', notes: 'Avvisi e info' }

function matches(kind: TrafficKind, filters: Record<Filter, boolean>): boolean {
  if (kind === 'TX') return filters.tx
  if (kind === 'RX') return filters.rx
  return filters.notes
}

function formatTime(time: number): string {
  const d = new Date(time)
  return `${d.toLocaleTimeString('it-IT')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

interface Props {
  entries: LogEntry[]
  counts: LogCounts
  onClear: () => void
}

/** Ogni pacchetto inviato (TX) e ricevuto (RX), byte per byte, più gli avvisi. */
export function LogPanel({ entries, counts, onClear }: Props) {
  const [filters, setFilters] = useState<Record<Filter, boolean>>({ tx: true, rx: true, notes: true })
  const [frozen, setFrozen] = useState<LogEntry[] | null>(null)

  const source = frozen ?? entries
  const shown = source.filter((e) => matches(e.kind, filters))
  const newSincePause = frozen ? entries.filter((e) => e.seq > (frozen.at(-1)?.seq ?? -1)).length : 0

  return (
    <section className="panel log-panel" aria-labelledby="log-title">
      <header className="log-header">
        <h2 id="log-title">Log seriale</h2>
        <div className="row">
          <button
            type="button"
            onClick={() => setFrozen(frozen ? null : entries)}
            aria-pressed={frozen !== null}
            className={frozen ? 'primary' : ''}
          >
            {frozen ? 'Riprendi' : 'Pausa'}
          </button>
          <button type="button" onClick={onClear}>
            Svuota
          </button>
        </div>
      </header>

      <dl className="counters">
        <div>
          <dt>TX</dt>
          <dd>{counts.tx}</dd>
        </div>
        <div>
          <dt>RX</dt>
          <dd>{counts.rx}</dd>
        </div>
        <div className={counts.timeouts > 0 ? 'counter-warn' : ''}>
          <dt>Timeout</dt>
          <dd>{counts.timeouts}</dd>
        </div>
        <div className={counts.alarms > 0 ? 'counter-alarm' : ''}>
          <dt>Stato ≠ 00</dt>
          <dd>{counts.alarms}</dd>
        </div>
      </dl>

      <fieldset className="filters">
        <legend className="visually-hidden">Mostra</legend>
        {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
          <label key={f}>
            <input
              type="checkbox"
              checked={filters[f]}
              onChange={(e) => setFilters((prev) => ({ ...prev, [f]: e.target.checked }))}
            />{' '}
            {FILTER_LABELS[f]}
          </label>
        ))}
      </fieldset>

      {frozen && (
        <p className="note log-paused">
          In pausa: {newSincePause} nuove righe non mostrate. Il traffico continua.
        </p>
      )}

      <ol className="log">
        {/* Più recenti in alto. */}
        {[...shown].reverse().map((e) => (
          <LogRow key={e.seq} entry={e} />
        ))}
      </ol>
    </section>
  )
}

// Le righe non cambiano mai dopo la creazione: memo evita di ridisegnarle.
const LogRow = memo(function LogRow({ entry: e }: { entry: LogEntry }) {
  const bytes = e.hex && (e.kind === 'TX' || e.kind === 'RX') ? fromHex(e.hex) : null
  return (
    <li className={`log-${e.kind.toLowerCase()}${e.alarm ? ' log-alarm' : ''}`}>
      <span className="log-time">{formatTime(e.time)}</span>
      <span className="log-kind">{e.kind}</span>
      {bytes ? (
        <span className="log-bytes">
          {dissectPacket(bytes, e.kind as 'TX' | 'RX').fields.map((f) => (
            <span
              key={f.index}
              className={`byte byte-sm k-${f.kind}${f.kind === 'status' && f.value !== 0 ? ' byte-alarm' : ''}`}
              title={f.description}
            >
              <span className="byte-hex">{f.value.toString(16).toUpperCase().padStart(2, '0')}</span>
              <span className="byte-label">{f.label}</span>
            </span>
          ))}
        </span>
      ) : (
        e.hex && <code>{e.hex}</code>
      )}
      {e.text && <span className="log-text">{e.text}</span>}
    </li>
  )
})
