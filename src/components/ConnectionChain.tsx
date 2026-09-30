import { BAUD_RATE } from '../serial/config'
import { toHex } from '../serial/protocol'
import { responseStatus, useExchanges } from './appContext'

interface Props {
  connected: boolean
}

type NodeState = 'idle' | 'ok' | 'alarm'

interface ChainNode {
  name: string
  detail: string
  state: NodeState
}

const STATE_WORD: Record<NodeState, string> = { idle: 'in attesa', ok: 'ok', alarm: 'problema' }

/**
 * Catena statica dal browser al servo, con lo stato di ogni anello scritto a
 * parole. Nessuna animazione: si aggiorna quando cambia lo stato.
 */
export function ConnectionChain({ connected }: Props) {
  const ping = useExchanges().ping
  const status = responseStatus(ping)

  const servo: ChainNode =
    !connected || !ping
      ? { name: 'Servo ID 1', detail: 'non ancora interrogato', state: 'idle' }
      : ping.state === 'pending'
        ? { name: 'Servo ID 1', detail: 'ping inviato, in attesa', state: 'idle' }
        : ping.state === 'unanswered'
          ? { name: 'Servo ID 1', detail: 'non risponde: controlla 12 V e cavi', state: 'alarm' }
          : status === 0
            ? { name: 'Servo ID 1', detail: 'risponde, stato 00', state: 'ok' }
            : { name: 'Servo ID 1', detail: `risponde con stato ${toHex([status ?? 0])}`, state: 'alarm' }

  const nodes: ChainNode[] = [
    { name: 'Browser', detail: 'Web Serial API', state: 'serial' in navigator ? 'ok' : 'alarm' },
    {
      name: 'Porta seriale',
      detail: connected ? `aperta a ${BAUD_RATE.toLocaleString('it-IT')} baud, 8N1` : 'chiusa',
      state: connected ? 'ok' : 'idle',
    },
    { name: 'Adattatore USB', detail: 'USB ⇄ UART', state: connected ? 'ok' : 'idle' },
    { name: 'Bus half duplex', detail: 'un filo, si parla a turno', state: servo.state === 'ok' ? 'ok' : 'idle' },
    servo,
  ]

  return (
    <ol className="chain" aria-label="Catena di collegamento">
      {nodes.map((n) => (
        <li key={n.name} className={`chain-node chain-${n.state}`}>
          <span className="chain-state">{STATE_WORD[n.state]}</span>
          <strong>{n.name}</strong>
          <span className="chain-detail">{n.detail}</span>
        </li>
      ))}
    </ol>
  )
}
