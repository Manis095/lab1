import type { TrafficEvent } from '../serial/connection'

export interface LogEntry extends TrafficEvent {
  seq: number
}

function formatTime(time: number): string {
  const d = new Date(time)
  return `${d.toLocaleTimeString('it-IT')}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

interface Props {
  entries: LogEntry[]
  onClear: () => void
}

/** Ogni pacchetto inviato (TX) e ricevuto (RX) in esadecimale, più gli avvisi. */
export function LogPanel({ entries, onClear }: Props) {
  return (
    <section className="panel log-panel">
      <header>
        <h2>Log seriale</h2>
        <button type="button" onClick={onClear}>
          Svuota
        </button>
      </header>
      <ol className="log">
        {/* Più recenti in alto. */}
        {[...entries].reverse().map((e) => (
          <li key={e.seq} className={`log-${e.kind.toLowerCase()}${e.alarm ? ' log-alarm' : ''}`}>
            <span className="log-time">{formatTime(e.time)}</span>
            <span className="log-kind">{e.kind}</span>
            {e.hex && <code>{e.hex}</code>}
            <span className="log-text">{e.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
