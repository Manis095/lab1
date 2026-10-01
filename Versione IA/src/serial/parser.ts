// Separazione dei pacchetti dal flusso di byte.
// read() restituisce i byte disponibili in quel momento, non un pacchetto:
// una risposta può arrivare spezzata o attaccata alla precedente.

import { checksum, HEADER_BYTE } from './protocol'

export class PacketParser {
  private buffer = new Uint8Array(0)
  /** Byte scartati per risincronizzazione (utile per la diagnostica). */
  discardedBytes = 0

  /** Aggiunge i byte in coda e restituisce i pacchetti completi e validi. */
  feed(chunk: Uint8Array): Uint8Array[] {
    this.append(chunk)
    const packets: Uint8Array[] = []

    while (this.buffer.length >= 4) {
      // Risincronizzazione: il pacchetto deve iniziare con FF FF.
      if (this.buffer[0] !== HEADER_BYTE || this.buffer[1] !== HEADER_BYTE) {
        this.dropJunkByte()
        continue
      }
      // LEN minimo 2 (ERR/ISTR + CHK): valori più piccoli non sono un pacchetto.
      if (this.buffer[3] < 2) {
        this.dropJunkByte()
        continue
      }
      const total = 4 + this.buffer[3]
      if (this.buffer.length < total) break // aspetta altri byte

      const candidate = this.buffer.subarray(0, total)
      if (candidate[total - 1] !== checksum(candidate.subarray(2, total - 1))) {
        // FF FF può comparire anche dentro i dati: scarta UN solo byte e riprova.
        this.dropJunkByte()
        continue
      }
      packets.push(candidate.slice())
      this.buffer = this.buffer.slice(total)
    }
    return packets
  }

  /** Byte ancora in attesa di completare un pacchetto. */
  get pending(): Uint8Array {
    return this.buffer.slice()
  }

  reset(): void {
    this.buffer = new Uint8Array(0)
  }

  private append(chunk: Uint8Array): void {
    if (chunk.length === 0) return
    const next = new Uint8Array(this.buffer.length + chunk.length)
    next.set(this.buffer, 0)
    next.set(chunk, this.buffer.length)
    this.buffer = next
  }

  private dropJunkByte(): void {
    this.buffer = this.buffer.slice(1)
    this.discardedBytes++
  }
}
