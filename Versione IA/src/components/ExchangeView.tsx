import type { ExchangeKey } from '../learn/exchanges'
import { useExchanges } from './appContext'
import { PacketView } from './PacketView'

const TITLES: Record<ExchangeKey, string> = {
  ping: 'Ultimo ping',
  goal: 'Ultima scrittura della posizione obiettivo',
  position: 'Ultima lettura della posizione',
  telemetry: 'Ultima lettura del monitor',
  other: 'Ultima altra richiesta',
}

interface Props {
  keys: ExchangeKey[]
  /** Suggerimento mostrato quando non c'è ancora traffico. */
  emptyHint: string
}

/** Ultimi scambi TX/RX di un certo tipo, con i byte scomposti. */
export function ExchangeView({ keys, emptyHint }: Props) {
  const exchanges = useExchanges()
  const shown = keys.map((k) => exchanges[k]).filter((e) => e !== undefined)

  return (
    <div className="exchange">
      <h3>Sul filo</h3>
      {shown.length === 0 && <p className="note">{emptyHint}</p>}
      {shown.map((e) => (
        <div key={e.key} className="exchange-item">
          <p className="exchange-title">{TITLES[e.key]}</p>
          <PacketView packet={e.tx} direction="TX" />
          {e.rx && <PacketView packet={e.rx} direction="RX" />}
          {e.state === 'pending' && <p className="note">In attesa della risposta...</p>}
          {e.state === 'unanswered' && (
            <p className="badge alarm">Nessuna risposta (timeout): vedi il log</p>
          )}
          {e.rx && e.rxTime !== null && (
            <p className="note">Risposta dopo {Math.max(0, e.rxTime - e.txTime)} ms.</p>
          )}
        </div>
      ))}
    </div>
  )
}
