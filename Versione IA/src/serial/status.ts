// Traduzione del byte di stato ERR delle risposte.
//
// DA VERIFICARE: il significato dei singoli bit NON è confermato per la serie
// STS. La mappa qui sotto è un'ipotesi (ricalca il protocollo "tipo Dynamixel 1.0"
// da cui deriva quello Feetech). Per questo l'interfaccia mostra sempre anche il
// valore esadecimale grezzo: fidarsi di quello, non della traduzione.

import { toHex } from './protocol'

export const STATUS_BITS_VERIFIED = false

const STATUS_BIT_LABELS: Record<number, string> = {
  0: 'tensione fuori range',
  1: 'sensore di angolo / limite angolo',
  2: 'temperatura eccessiva',
  3: 'corrente eccessiva / valore fuori range',
  4: 'errore di checksum',
  5: 'sovraccarico',
  6: 'istruzione non valida',
  7: 'bit 7 (sconosciuto)',
}

export interface StatusDescription {
  raw: number
  hex: string
  ok: boolean
  /** Etichette ipotetiche dei bit attivi (da verificare). */
  flags: string[]
}

export function describeStatus(status: number): StatusDescription {
  const flags: string[] = []
  for (let bit = 0; bit < 8; bit++) {
    if (status & (1 << bit)) flags.push(`bit ${bit}: ${STATUS_BIT_LABELS[bit]}`)
  }
  return { raw: status, hex: toHex([status]), ok: status === 0, flags }
}

/** Testo breve per log e interfaccia, con il valore grezzo sempre presente. */
export function formatStatus(status: number): string {
  const d = describeStatus(status)
  if (d.ok) return `stato ${d.hex} (nessuna anomalia)`
  return `stato ${d.hex} ANOMALIA: ${d.flags.join(', ')} (significato dei bit da verificare)`
}
