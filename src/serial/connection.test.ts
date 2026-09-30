import { describe, expect, it } from 'vitest'
import { BAUD_RATE } from './config'
import {
  assertPacketAllowed,
  NotConnectedError,
  SerialConnection,
  TimeoutError,
  type TrafficEvent,
} from './connection'
import { buildPing, buildRead, buildWrite, checksum, fromLE16, toHex, toLE16 } from './protocol'
import { UnsafeWriteError } from './registers'
import { Servo } from './servo'

const hex = (s: string) => Uint8Array.from(s.split(' '), (b) => parseInt(b, 16))

function response(id: number, status: number, data: number[] = []): Uint8Array {
  const body = [id, data.length + 2, status, ...data]
  return Uint8Array.from([0xff, 0xff, ...body, checksum(body)])
}

type Responder = (packet: Uint8Array, port: FakePort) => void

/** Porta seriale finta: come quella vera, close() fallisce se i flussi sono bloccati. */
class FakePort {
  readable: ReadableStream<Uint8Array> | null = null
  writable: WritableStream<Uint8Array> | null = null
  written: Uint8Array[] = []
  baudRate = 0
  closed = false
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null
  private cancelled = false

  constructor(public respond: Responder) {}

  async open(options: { baudRate: number }): Promise<void> {
    this.baudRate = options.baudRate
    this.closed = false
    this.cancelled = false
    this.readable = new ReadableStream<Uint8Array>({
      start: (c) => {
        this.controller = c
      },
      cancel: () => {
        this.cancelled = true
      },
    })
    this.writable = new WritableStream<Uint8Array>({
      write: (chunk) => {
        this.written.push(chunk.slice())
        this.respond(chunk, this)
      },
    })
  }

  /** Consegna byte al lettore in modo asincrono, come l'adattatore USB. */
  push(...chunks: Uint8Array[]): void {
    let delay = 0
    for (const chunk of chunks) {
      setTimeout(() => {
        if (!this.cancelled) this.controller?.enqueue(chunk)
      }, delay++)
    }
  }

  async close(): Promise<void> {
    if (this.readable?.locked || this.writable?.locked) {
      throw new Error('Failed to execute close: stream bloccato')
    }
    this.closed = true
  }

  asSerialPort(): SerialPort {
    return this as unknown as SerialPort
  }
}

/** Servo simulato con una tabella di registri. */
function servoResponder(memory = new Uint8Array(256), status = 0): Responder {
  return (packet, port) => {
    const id = packet[2]
    switch (packet[4]) {
      case 1:
        port.push(response(id, status))
        break
      case 2: {
        const [address, count] = [packet[5], packet[6]]
        port.push(response(id, status, Array.from(memory.subarray(address, address + count))))
        break
      }
      case 3:
        memory.set(packet.subarray(6, packet.length - 1), packet[5])
        port.push(response(id, status))
        break
    }
  }
}

async function connected(respond: Responder) {
  const port = new FakePort(respond)
  const connection = new SerialConnection()
  const events: TrafficEvent[] = []
  connection.onTraffic((e) => events.push(e))
  await connection.connect(port.asSerialPort())
  return { port, connection, events, servo: new Servo(connection) }
}

describe('assertPacketAllowed', () => {
  it('ammette ping, lettura e scrittura della posizione obiettivo', () => {
    expect(() => assertPacketAllowed(buildPing(1))).not.toThrow()
    expect(() => assertPacketAllowed(buildRead(1, 5, 1))).not.toThrow()
    expect(() => assertPacketAllowed(buildWrite(1, 42, toLE16(2048)))).not.toThrow()
    expect(() => assertPacketAllowed(buildWrite(1, 40, [1]))).not.toThrow()
  })
  it('blocca EEPROM, registro 55, altre istruzioni e broadcast', () => {
    expect(() => assertPacketAllowed(buildWrite(1, 5, [2]))).toThrow(UnsafeWriteError) // ID
    expect(() => assertPacketAllowed(buildWrite(1, 6, [0]))).toThrow(UnsafeWriteError) // baud
    expect(() => assertPacketAllowed(buildWrite(1, 7, [0]))).toThrow(UnsafeWriteError) // ritardo
    expect(() => assertPacketAllowed(buildWrite(1, 39, [0, 0]))).toThrow(UnsafeWriteError)
    expect(() => assertPacketAllowed(buildWrite(1, 55, [0]))).toThrow(UnsafeWriteError)
    expect(() => assertPacketAllowed(buildWrite(1, 54, [0, 0]))).toThrow(UnsafeWriteError)
    // REG WRITE (0x04) all'indirizzo 42: istruzione non ammessa.
    const regWrite = Uint8Array.from(buildWrite(1, 42, [0, 8]))
    regWrite[4] = 0x04
    regWrite[regWrite.length - 1] = checksum(regWrite.subarray(2, regWrite.length - 1))
    expect(() => assertPacketAllowed(regWrite)).toThrow(UnsafeWriteError)
    expect(() => assertPacketAllowed(buildWrite(254, 42, [0, 8]))).toThrow(UnsafeWriteError)
  })
})

describe('SerialConnection', () => {
  it('apre a 1 Mbaud, invia il ping e riceve lo stato 00', async () => {
    const { port, servo, events, connection } = await connected(servoResponder())
    expect(port.baudRate).toBe(BAUD_RATE)
    expect(await servo.ping()).toBe(0)
    expect(toHex(port.written[0])).toBe('FF FF 01 02 01 FB')
    expect(events.find((e) => e.kind === 'RX')?.hex).toBe('FF FF 01 02 00 FC')
    await connection.disconnect()
  })

  it('una scrittura vietata lancia un errore e non trasmette nulla', async () => {
    const { port, connection } = await connected(servoResponder())
    await expect(connection.request(buildWrite(1, 5, [2]))).rejects.toThrow(UnsafeWriteError)
    await expect(connection.request(buildWrite(1, 55, [0]))).rejects.toThrow(UnsafeWriteError)
    expect(port.written).toHaveLength(0)
    await connection.disconnect()
  })

  it('due richieste di fila senza attesa: una alla volta, risposte separate', async () => {
    const memory = new Uint8Array(256)
    memory.set(toLE16(3060), 56)
    const { port, servo, connection } = await connected(servoResponder(memory))
    const [a, b] = await Promise.all([servo.ping(), servo.readPosition()])
    expect(a).toBe(0)
    expect(b).toEqual({ value: 3060, status: 0 })
    expect(port.written.map(toHex)).toEqual(['FF FF 01 02 01 FB', 'FF FF 01 04 02 38 02 BE'])
    await connection.disconnect()
  })

  it('risposta spezzata in tre pezzi', async () => {
    const { servo, connection } = await connected((_, port) =>
      port.push(hex('FF FF 01'), hex('04 00'), hex('F4 0B FB')),
    )
    expect(await servo.readPosition()).toEqual({ value: 3060, status: 0 })
    await connection.disconnect()
  })

  it('ignora l’eco del pacchetto trasmesso', async () => {
    const { servo, connection } = await connected((packet, port) =>
      port.push(packet.slice(), hex('FF FF 01 02 00 FC')),
    )
    expect(await servo.ping()).toBe(0)
    await connection.disconnect()
  })

  it('timeout se il servo non risponde, poi la coda riparte', async () => {
    let silent = true
    const respond = servoResponder()
    const { connection, events } = await connected((packet, port) => {
      if (!silent) respond(packet, port)
    })
    await expect(connection.request(buildPing(1), 10)).rejects.toThrow(TimeoutError)
    expect(connection.consecutiveTimeouts).toBe(1)
    expect(events.some((e) => e.kind === 'WARN' && /10 ms/.test(e.text))).toBe(true)
    silent = false
    expect((await connection.request(buildPing(1))).status).toBe(0)
    expect(connection.consecutiveTimeouts).toBe(0)
    await connection.disconnect()
  })

  it('ignora risposte di un altro ID o di lunghezza diversa', async () => {
    const { servo, connection, events } = await connected((_, port) =>
      port.push(response(2, 0), response(1, 0, [1]), response(1, 0, [0x00, 0x08])),
    )
    expect(await servo.readPosition()).toEqual({ value: 2048, status: 0 })
    expect(events.filter((e) => /inattesa/.test(e.text))).toHaveLength(2)
    await connection.disconnect()
  })

  it('passa lo stato diverso da zero e lo marca come allarme', async () => {
    const { servo, events, connection } = await connected(servoResponder(undefined, 0x20))
    expect(await servo.ping()).toBe(0x20)
    const rx = events.find((e) => e.kind === 'RX')
    expect(rx?.alarm).toBe(true)
    expect(rx?.text).toMatch(/20/)
    await connection.disconnect()
  })

  it('chiusura ordinata: lock rilasciati, porta chiusa, riapribile', async () => {
    const { port, connection, servo } = await connected(servoResponder())
    await connection.disconnect()
    expect(port.closed).toBe(true)
    expect(port.readable?.locked).toBe(false)
    expect(port.writable?.locked).toBe(false)
    expect(connection.connected).toBe(false)
    await expect(servo.ping()).rejects.toThrow(NotConnectedError)
    // Come dopo un ricaricamento: la stessa porta si riapre.
    await connection.connect(port.asSerialPort())
    expect(await servo.ping()).toBe(0)
    await connection.disconnect()
    expect(port.closed).toBe(true)
  })

  it('la disconnessione rifiuta la richiesta in volo', async () => {
    const { connection } = await connected(() => undefined)
    const pending = connection.request(buildPing(1), 1000)
    await new Promise((r) => setTimeout(r, 5))
    await connection.disconnect()
    await expect(pending).rejects.toThrow(NotConnectedError)
  })
})

describe('Servo', () => {
  it('scrive la posizione in little endian e la limita a 4095', async () => {
    const memory = new Uint8Array(256)
    const { servo, port, connection } = await connected(servoResponder(memory))
    expect(await servo.writeGoalPosition(2048)).toEqual({ value: 2048, status: 0 })
    expect(toHex(port.written[0])).toBe('FF FF 01 05 03 2A 00 08 C4')
    expect((await servo.writeGoalPosition(47115)).value).toBe(4095)
    expect(fromLE16(memory, 42)).toBe(4095)
    expect((await servo.writeGoalPosition(-5)).value).toBe(0)
    await connection.disconnect()
  })

  it('legge la telemetria in un solo blocco 60..70', async () => {
    const memory = new Uint8Array(256)
    memory.set(toLE16(1024 + 300), 60) // carico 30%, direzione 1
    memory[62] = 121
    memory[63] = 31
    memory[66] = 1
    memory.set(toLE16(12), 69)
    const { servo, port, connection } = await connected(servoResponder(memory))
    const { value, status } = await servo.readTelemetry()
    expect(status).toBe(0)
    expect(value).toEqual({
      loadRaw: 1324,
      voltageRaw: 121,
      temperatureRaw: 31,
      movingRaw: 1,
      currentRaw: 12,
    })
    expect(toHex(port.written[0])).toBe(toHex(buildRead(1, 60, 11)))
    await connection.disconnect()
  })
})
