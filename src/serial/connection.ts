// Collegamento Web Serial con il bus dei servo.
// Nessuna dipendenza dall'interfaccia: la usa l'app di laboratorio e la userà
// il braccio. Il bus è half duplex: una sola richiesta in volo alla volta.

import { BAUD_RATE, DEFAULT_TIMEOUT_MS, TIMEOUT_ALARM_THRESHOLD } from './config'
import { PacketParser } from './parser'
import {
  BROADCAST_ID,
  Instruction,
  parseResponse,
  type ServoResponse,
  toHex,
} from './protocol'
import { assertWritable, UnsafeWriteError } from './registers'
import { formatStatus } from './status'

export type TrafficKind = 'TX' | 'RX' | 'INFO' | 'WARN' | 'ERROR'

export interface TrafficEvent {
  kind: TrafficKind
  time: number
  /** Byte trasmessi o ricevuti, in esadecimale (solo TX/RX). */
  hex?: string
  text: string
  /** true per risposte con stato diverso da zero e per gli errori. */
  alarm: boolean
}

export type TrafficListener = (event: TrafficEvent) => void

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export class NotConnectedError extends Error {
  constructor() {
    super('Porta seriale non collegata')
    this.name = 'NotConnectedError'
  }
}

/**
 * Blocco di sicurezza: lancia UnsafeWriteError per qualsiasi pacchetto che
 * potrebbe scrivere nell'area vietata. Sono ammessi solo ping, lettura e
 * scrittura; le altre istruzioni (REG WRITE, SYNC WRITE, RESET...) sono vietate
 * perché anch'esse possono modificare la EEPROM. Il broadcast è vietato perché
 * non riceve risposta e muoverebbe tutti i servo del bus.
 */
export function assertPacketAllowed(packet: Uint8Array): void {
  if (packet.length < 6) throw new UnsafeWriteError('Pacchetto troppo corto')
  const id = packet[2]
  const instruction = packet[4]
  if (id === BROADCAST_ID) {
    throw new UnsafeWriteError('Invio in broadcast (ID 254) non consentito')
  }
  if (instruction === Instruction.Ping || instruction === Instruction.Read) return
  if (instruction === Instruction.Write) {
    const address = packet[5]
    const dataLength = packet[3] - 3 // LEN = ISTR + indirizzo + dati + CHK
    assertWritable(address, dataLength)
    return
  }
  throw new UnsafeWriteError(`Istruzione ${toHex([instruction])} non consentita`)
}

/** Byte di dati attesi nella risposta: N per una lettura, 0 per ping e scrittura. */
function expectedDataLength(packet: Uint8Array): number {
  return packet[4] === Instruction.Read ? packet[6] : 0
}

interface PendingRequest {
  id: number
  dataLength: number
  sent: Uint8Array
  echoSkipped: boolean
  resolve: (response: ServoResponse) => void
  reject: (error: Error) => void
}

// Connessioni aperte, da chiudere su pagehide e ricaricamento a caldo.
const openConnections = new Set<SerialConnection>()

export class SerialConnection {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private active = false
  private readLoopDone: Promise<void> | null = null
  private closing: Promise<void> | null = null
  private readonly parser = new PacketParser()
  private queue: Promise<unknown> = Promise.resolve()
  private pending: PendingRequest | null = null
  private listeners = new Set<TrafficListener>()
  private disconnectListeners = new Set<() => void>()

  /** Timeout consecutivi: molti di fila indicano alimentazione o cavi guasti. */
  consecutiveTimeouts = 0

  get connected(): boolean {
    return this.active
  }

  onTraffic(listener: TrafficListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Chiamato quando la porta si chiude (anche per cavo scollegato). */
  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  /**
   * Apre la porta. Senza argomento chiede all'utente di sceglierla con
   * requestPort(): va chiamata SOLO da un gestore di clic, mai da useEffect.
   */
  async connect(port?: SerialPort): Promise<void> {
    if (this.active) return
    if (this.closing) await this.closing
    if (!port) {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial non disponibile: usa Chrome o Edge su localhost o https')
      }
      port = await navigator.serial.requestPort()
    }
    await port.open({ baudRate: BAUD_RATE })
    if (!port.readable || !port.writable) {
      await port.close()
      throw new Error('La porta non espone i flussi di lettura/scrittura')
    }
    this.port = port
    // Un solo lettore e un solo scrittore: il lock è esclusivo.
    this.reader = port.readable.getReader()
    this.writer = port.writable.getWriter()
    this.parser.reset()
    this.consecutiveTimeouts = 0
    this.active = true
    openConnections.add(this)
    this.readLoopDone = this.readLoop(this.reader)
    this.emit('INFO', `Porta aperta a ${BAUD_RATE} baud`)
  }

  /**
   * Chiusura ordinata: attivo = false, cancel del lettore (la read in sospeso
   * termina), rilascio dei lock, close della porta. Saltare un passo lascia la
   * porta occupata e dopo un ricaricamento open() fallisce.
   */
  disconnect(): Promise<void> {
    if (this.closing) return this.closing
    if (!this.port) return Promise.resolve()
    this.closing = this.close().finally(() => {
      this.closing = null
    })
    return this.closing
  }

  private async close(): Promise<void> {
    const { port, reader, writer } = this
    this.active = false
    openConnections.delete(this)
    this.pending?.reject(new NotConnectedError())
    this.pending = null
    try {
      await reader?.cancel()
    } catch (err) {
      this.emit('WARN', `cancel del lettore: ${String(err)}`)
    }
    await this.readLoopDone
    try {
      reader?.releaseLock()
    } catch (err) {
      this.emit('WARN', `rilascio del lettore: ${String(err)}`)
    }
    try {
      writer?.releaseLock()
    } catch (err) {
      this.emit('WARN', `rilascio dello scrittore: ${String(err)}`)
    }
    try {
      await port?.close()
      this.emit('INFO', 'Porta chiusa')
    } catch (err) {
      this.emit('ERROR', `Chiusura della porta non riuscita: ${String(err)}`)
    }
    this.port = null
    this.reader = null
    this.writer = null
    this.readLoopDone = null
    for (const listener of this.disconnectListeners) listener()
  }

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      while (this.active) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) this.handleChunk(value)
      }
    } catch (err) {
      if (this.active) this.emit('ERROR', `Errore di lettura: ${String(err)}`)
    }
    // Uscita non richiesta (cavo scollegato, errore): chiude in modo ordinato.
    if (this.active) {
      this.emit('WARN', 'Lettura interrotta: chiudo la porta')
      this.readLoopDone = null // evita che close() attenda questo stesso ciclo
      void this.disconnect()
    }
  }

  private handleChunk(chunk: Uint8Array): void {
    for (const packet of this.parser.feed(chunk)) {
      const pending = this.pending
      // Alcuni adattatori half duplex rimandano indietro quello che trasmettono.
      if (pending && !pending.echoSkipped && equalBytes(packet, pending.sent)) {
        pending.echoSkipped = true
        this.emit('INFO', 'Eco del pacchetto trasmesso ignorata', packet)
        continue
      }
      const response = parseResponse(packet) // il parser ha già verificato il checksum
      this.emit('RX', formatStatus(response.status), packet, response.status !== 0)
      if (
        pending &&
        response.id === pending.id &&
        response.data.length === pending.dataLength
      ) {
        this.pending = null
        pending.resolve(response)
      } else {
        this.emit('WARN', 'Risposta inattesa (nessuna richiesta corrispondente): scartata')
      }
    }
  }

  /**
   * Invia un pacchetto e attende la risposta dello stesso ID. Le richieste
   * vanno in coda: una sola in volo alla volta. Il controllo di sicurezza
   * avviene prima di mettere in coda.
   */
  request(packet: Uint8Array, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<ServoResponse> {
    try {
      assertPacketAllowed(packet)
    } catch (err) {
      this.emit('ERROR', `Invio bloccato: ${(err as Error).message}`, packet)
      return Promise.reject(err)
    }
    const run = this.queue.then(() => this.execute(packet, timeoutMs))
    this.queue = run.catch(() => undefined) // un errore non blocca la coda
    return run
  }

  private async execute(packet: Uint8Array, timeoutMs: number): Promise<ServoResponse> {
    const writer = this.writer
    if (!this.active || !writer) throw new NotConnectedError()

    let timer: ReturnType<typeof setTimeout> | undefined
    const response = new Promise<ServoResponse>((resolve, reject) => {
      this.pending = {
        id: packet[2],
        dataLength: expectedDataLength(packet),
        sent: packet,
        echoSkipped: false,
        resolve,
        reject,
      }
      timer = setTimeout(() => {
        this.pending = null
        // Svuota il buffer: un LEN spurio potrebbe tenerlo bloccato in attesa.
        this.parser.reset()
        this.consecutiveTimeouts++
        const message = `Nessuna risposta entro ${timeoutMs} ms (ID ${packet[2]})`
        if (this.consecutiveTimeouts >= TIMEOUT_ALARM_THRESHOLD) {
          this.emit(
            'ERROR',
            `${message}: ${this.consecutiveTimeouts} timeout di fila, controlla alimentazione 12 V e cablaggio`,
          )
        } else {
          this.emit('WARN', message)
        }
        reject(new TimeoutError(message))
      }, timeoutMs)
    })

    try {
      this.emit('TX', describeRequest(packet), packet)
      await writer.write(packet)
      const result = await response
      this.consecutiveTimeouts = 0
      return result
    } finally {
      clearTimeout(timer)
      if (this.pending?.sent === packet) this.pending = null
    }
  }

  private emit(kind: TrafficKind, text: string, bytes?: Uint8Array, alarm = false): void {
    const event: TrafficEvent = {
      kind,
      time: Date.now(),
      hex: bytes ? toHex(bytes) : undefined,
      text,
      alarm: alarm || kind === 'ERROR',
    }
    for (const listener of this.listeners) listener(event)
  }
}

/** Descrizione leggibile di una richiesta per il log. */
function describeRequest(packet: Uint8Array): string {
  const id = packet[2]
  switch (packet[4]) {
    case Instruction.Ping:
      return `ping ID ${id}`
    case Instruction.Read:
      return `lettura ID ${id}: ${packet[6]} byte dall'indirizzo ${packet[5]}`
    case Instruction.Write:
      return `scrittura ID ${id}: ${packet[3] - 3} byte all'indirizzo ${packet[5]}`
    default:
      return `istruzione ${toHex([packet[4]])} ID ${id}`
  }
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Chiude tutte le connessioni aperte (pagehide, ricaricamento a caldo). */
export function disconnectAll(): Promise<void> {
  return Promise.all([...openConnections].map((c) => c.disconnect())).then(() => undefined)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void disconnectAll()
  })
}

// Vite: quando questo modulo viene sostituito a caldo, chiude la porta.
import.meta.hot?.dispose(() => disconnectAll())
