// Scomposizione di un pacchetto nei suoi campi, per mostrarlo byte per byte.
// Funzioni pure: nessuna dipendenza dal browser.

import { checksum, fromLE16, HEADER_BYTE, Instruction, toHex } from '../serial/protocol'

export type Direction = 'TX' | 'RX'

export type FieldKind =
  | 'header'
  | 'id'
  | 'length'
  | 'instruction'
  | 'status'
  | 'address'
  | 'count'
  | 'data'
  | 'checksum'

export interface ByteField {
  index: number
  value: number
  kind: FieldKind
  /** Etichetta breve sempre visibile sotto il byte (il colore non basta). */
  label: string
  /** Spiegazione completa del byte. */
  description: string
}

export interface PacketAnatomy {
  direction: Direction
  fields: ByteField[]
  /** Riassunto in una riga, per esempio "Scrittura di 2 byte all'indirizzo 42". */
  summary: string
  checksumOk: boolean
}

const INSTRUCTION_NAMES: Record<number, string> = {
  [Instruction.Ping]: 'ping',
  [Instruction.Read]: 'lettura',
  [Instruction.Write]: 'scrittura',
}

export function instructionName(value: number): string {
  return INSTRUCTION_NAMES[value] ?? `istruzione ${toHex([value])}`
}

/** Scompone un pacchetto TX (richiesta) o RX (risposta). */
export function dissectPacket(packet: Uint8Array, direction: Direction): PacketAnatomy {
  const fields: ByteField[] = []
  const add = (index: number, kind: FieldKind, label: string, description: string) =>
    fields.push({ index, value: packet[index], kind, label, description })

  const last = packet.length - 1
  const hasHeader = packet.length >= 6 && packet[0] === HEADER_BYTE && packet[1] === HEADER_BYTE
  const expected = packet.length >= 3 ? checksum(packet.subarray(2, last)) : -1
  const checksumOk = hasHeader && packet[last] === expected

  if (!hasHeader) {
    packet.forEach((_, i) => add(i, 'data', '?', 'Byte fuori da un pacchetto riconoscibile'))
    return { direction, fields, summary: 'Sequenza di byte non riconosciuta', checksumOk: false }
  }

  add(0, 'header', 'INTEST', 'Intestazione: ogni pacchetto inizia con FF FF')
  add(1, 'header', 'INTEST', 'Intestazione: secondo FF')
  add(2, 'id', 'ID', `ID ${packet[2]}: ${direction === 'TX' ? 'destinatario' : 'servo che risponde'}`)
  add(3, 'length', 'LEN', `LEN = ${packet[3]}: byte che seguono, checksum compreso. Totale 4 + ${packet[3]} = ${4 + packet[3]}`)

  let summary: string
  const payload = packet.subarray(5, last)

  if (direction === 'TX') {
    const instruction = packet[4]
    add(4, 'instruction', 'ISTR', `Istruzione ${instruction}: ${instructionName(instruction)}`)
    if (instruction === Instruction.Read && payload.length === 2) {
      add(5, 'address', 'IND', `Indirizzo di partenza: ${packet[5]}`)
      add(6, 'count', 'N', `Numero di byte da leggere: ${packet[6]}`)
      summary = `Lettura di ${packet[6]} byte dall'indirizzo ${packet[5]}`
    } else if (instruction === Instruction.Write && payload.length >= 2) {
      add(5, 'address', 'IND', `Indirizzo di partenza: ${packet[5]}`)
      addData(packet, 6, last, add)
      summary = `Scrittura di ${last - 6} byte all'indirizzo ${packet[5]}`
      if (last - 6 === 2) summary += ` (valore ${fromLE16(packet, 6)})`
    } else {
      addData(packet, 5, last, add)
      summary = `${capitalize(instructionName(instruction))} all'ID ${packet[2]}`
    }
  } else {
    const status = packet[4]
    add(4, 'status', 'ERR', status === 0 ? 'Stato 00: nessuna anomalia' : `Stato ${toHex([status])}: anomalia segnalata dal servo`)
    addData(packet, 5, last, add)
    const n = last - 5
    summary = n === 0 ? `Risposta senza dati, stato ${toHex([status])}` : `Risposta con ${n} byte di dati, stato ${toHex([status])}`
    if (n === 2) summary += ` (valore ${fromLE16(packet, 5)})`
  }

  add(
    last,
    'checksum',
    'CHK',
    checksumOk
      ? `Checksum ${toHex([packet[last]])}: corretto`
      : `Checksum ${toHex([packet[last]])}: SBAGLIATO, atteso ${toHex([expected])}`,
  )
  return { direction, fields, summary, checksumOk }
}

type AddField = (index: number, kind: FieldKind, label: string, description: string) => void

/** Dati: se sono esattamente 2 byte li etichetta come basso e alto (little endian). */
function addData(packet: Uint8Array, from: number, to: number, add: AddField): void {
  const n = to - from
  if (n === 2) {
    const value = fromLE16(packet, from)
    add(from, 'data', 'DATO L', `Byte basso di ${value}: viene prima (little endian)`)
    add(from + 1, 'data', 'DATO H', `Byte alto di ${value}: viene dopo. ${packet[from]} + ${packet[from + 1]} × 256 = ${value}`)
    return
  }
  for (let i = from; i < to; i++) add(i, 'data', 'DATO', `Dato ${i - from + 1} di ${n}: ${packet[i]}`)
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export interface ChecksumStep {
  index: number
  value: number
  /** Somma progressiva senza modulo. */
  sum: number
}

export interface ChecksumWorkout {
  steps: ChecksumStep[]
  sum: number
  sumMod256: number
  complement: number
  received: number | null
  ok: boolean
}

/** Calcolo del checksum byte per byte, per mostrarlo nel ripasso. */
export function checksumWorkout(packet: Uint8Array): ChecksumWorkout {
  const last = packet.length - 1
  const steps: ChecksumStep[] = []
  let sum = 0
  for (let i = 2; i < last; i++) {
    sum += packet[i]
    steps.push({ index: i, value: packet[i], sum })
  }
  const sumMod256 = sum % 256
  const complement = ~sumMod256 & 0xff
  const received = last >= 2 ? packet[last] : null
  return { steps, sum, sumMod256, complement, received, ok: received === complement }
}
