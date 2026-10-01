// Protocollo seriale Feetech STS: costruzione e decodifica dei pacchetti.
// Funzioni pure, senza dipendenze dal browser: si possono testare in Node.
//
// Pacchetto:  FF FF  ID  LEN  ISTR  [parametri...]  CHK
// Risposta:   FF FF  ID  LEN  ERR   [dati...]       CHK
// LEN conta i byte che seguono LEN, checksum compreso: totale = 4 + LEN.

export const HEADER_BYTE = 0xff
export const BROADCAST_ID = 254
export const MAX_ID = 253

export const Instruction = {
  Ping: 0x01,
  Read: 0x02,
  Write: 0x03,
} as const

// Pacchetto più corto possibile: FF FF ID LEN ERR CHK
export const MIN_PACKET_LENGTH = 6

export class ProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProtocolError'
  }
}

function assertByte(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new ProtocolError(`${what} non valido: ${value} (atteso intero 0..255)`)
  }
}

function assertId(id: number): void {
  assertByte(id, 'ID')
  if (id > BROADCAST_ID) {
    throw new ProtocolError(`ID non valido: ${id} (0..${MAX_ID}, ${BROADCAST_ID} broadcast)`)
  }
}

/** Somma modulo 256 dei byte dati (da ID a fine parametri), poi complemento a uno. */
export function checksum(bytes: ArrayLike<number>): number {
  let sum = 0
  for (let i = 0; i < bytes.length; i++) sum = (sum + bytes[i]) & 0xff
  return ~sum & 0xff
}

function buildPacket(id: number, instruction: number, params: ArrayLike<number>): Uint8Array {
  assertId(id)
  const length = params.length + 2 // ISTR + parametri + CHK
  assertByte(length, 'LEN')
  const packet = new Uint8Array(4 + length)
  packet[0] = HEADER_BYTE
  packet[1] = HEADER_BYTE
  packet[2] = id
  packet[3] = length
  packet[4] = instruction
  for (let i = 0; i < params.length; i++) {
    assertByte(params[i], 'Parametro')
    packet[5 + i] = params[i]
  }
  packet[packet.length - 1] = checksum(packet.subarray(2, packet.length - 1))
  return packet
}

export function buildPing(id: number): Uint8Array {
  return buildPacket(id, Instruction.Ping, [])
}

export function buildRead(id: number, address: number, count: number): Uint8Array {
  assertByte(address, 'Indirizzo')
  if (!Number.isInteger(count) || count < 1 || count > 0xff) {
    throw new ProtocolError(`Numero di byte da leggere non valido: ${count}`)
  }
  return buildPacket(id, Instruction.Read, [address, count])
}

/**
 * Codifica una scrittura. Non controlla quali indirizzi sono scrivibili:
 * il blocco di sicurezza sta in SerialConnection, da cui passa ogni invio.
 */
export function buildWrite(id: number, address: number, data: ArrayLike<number>): Uint8Array {
  assertByte(address, 'Indirizzo')
  if (data.length === 0) throw new ProtocolError('Scrittura senza dati')
  return buildPacket(id, Instruction.Write, [address, ...Array.from(data)])
}

/** Valore a 16 bit in little endian: prima il byte basso, poi l'alto. */
export function toLE16(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new ProtocolError(`Valore a 16 bit non valido: ${value}`)
  }
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff)
}

export function fromLE16(bytes: ArrayLike<number>, offset = 0): number {
  if (offset + 1 >= bytes.length) {
    throw new ProtocolError('Dati insufficienti per un valore a 16 bit')
  }
  return bytes[offset] | (bytes[offset + 1] << 8)
}

export interface ServoResponse {
  id: number
  /** Byte di stato ERR: 0 = nessuna anomalia. */
  status: number
  data: Uint8Array
}

/** Verifica intestazione, lunghezza e checksum; restituisce id, stato e dati. */
export function parseResponse(packet: Uint8Array): ServoResponse {
  if (packet.length < MIN_PACKET_LENGTH) {
    throw new ProtocolError(`Pacchetto troppo corto (${packet.length} byte)`)
  }
  if (packet[0] !== HEADER_BYTE || packet[1] !== HEADER_BYTE) {
    throw new ProtocolError('Intestazione FF FF mancante')
  }
  const total = 4 + packet[3]
  if (packet.length !== total) {
    throw new ProtocolError(`Lunghezza incoerente: LEN indica ${total} byte, ricevuti ${packet.length}`)
  }
  const expected = checksum(packet.subarray(2, total - 1))
  if (packet[total - 1] !== expected) {
    throw new ProtocolError(
      `Checksum errato: ricevuto ${toHex([packet[total - 1]])}, atteso ${toHex([expected])}`,
    )
  }
  return {
    id: packet[2],
    status: packet[4],
    data: packet.slice(5, total - 1),
  }
}

/** Byte in esadecimale leggibile: "FF FF 01 02 01 FB". */
export function toHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
}
