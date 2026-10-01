// Ultimo scambio richiesta/risposta per ogni tipo di operazione, ricostruito
// dagli eventi del log. Serve ai pannelli per mostrare i byte veri.

import type { TrafficEvent } from '../serial/connection'
import { Instruction } from '../serial/protocol'
import { REG_GOAL_POSITION, REG_PRESENT_LOAD, REG_PRESENT_POSITION } from '../serial/registers'

export type ExchangeKey = 'ping' | 'goal' | 'position' | 'telemetry' | 'other'

export interface Exchange {
  key: ExchangeKey
  tx: Uint8Array
  txTime: number
  rx: Uint8Array | null
  rxTime: number | null
  /** pending: in attesa; answered: risposta arrivata; unanswered: nessuna risposta. */
  state: 'pending' | 'answered' | 'unanswered'
}

export type ExchangeMap = Partial<Record<ExchangeKey, Exchange>>

export function fromHex(text: string): Uint8Array {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  return Uint8Array.from(parts, (b) => parseInt(b, 16))
}

export function classifyRequest(packet: Uint8Array): ExchangeKey {
  const instruction = packet[4]
  if (instruction === Instruction.Ping) return 'ping'
  if (instruction === Instruction.Write && packet[5] === REG_GOAL_POSITION) return 'goal'
  if (instruction === Instruction.Read && packet[5] === REG_PRESENT_POSITION && packet[6] === 2) return 'position'
  // Il monitor legge un blocco che parte dal carico: più di 2 byte.
  if (instruction === Instruction.Read && packet[5] === REG_PRESENT_LOAD && packet[6] > 2) return 'telemetry'
  return 'other'
}

/**
 * Aggiorna la mappa con un evento del log. Restituisce una nuova mappa se
 * qualcosa è cambiato, altrimenti la stessa.
 */
export function applyTraffic(map: ExchangeMap, current: ExchangeKey | null, event: TrafficEvent): {
  map: ExchangeMap
  current: ExchangeKey | null
} {
  if (event.kind === 'TX' && event.hex) {
    const tx = fromHex(event.hex)
    const key = classifyRequest(tx)
    const next = { ...map }
    // Se lo scambio precedente è ancora in attesa, non ha avuto risposta.
    if (current && next[current]?.state === 'pending') {
      next[current] = { ...next[current]!, state: 'unanswered' }
    }
    next[key] = { key, tx, txTime: event.time, rx: null, rxTime: null, state: 'pending' }
    return { map: next, current: key }
  }
  if (event.kind === 'RX' && event.hex && current && map[current]?.state === 'pending') {
    const exchange = map[current]!
    return {
      map: { ...map, [current]: { ...exchange, rx: fromHex(event.hex), rxTime: event.time, state: 'answered' } },
      current,
    }
  }
  return { map, current }
}
