// Operazioni di alto livello su un servo STS, sopra SerialConnection.
// Ogni risultato riporta il byte di stato: il chiamante deve controllarlo
// (il servo risponde anche quando segnala un allarme).

import { SERVO_ID } from './config'
import type { SerialConnection } from './connection'
import { buildPing, buildRead, buildWrite, fromLE16, ProtocolError, toLE16 } from './protocol'
import {
  clampPosition,
  REG_GOAL_POSITION,
  REG_MOVING,
  REG_PRESENT_CURRENT,
  REG_PRESENT_LOAD,
  REG_PRESENT_POSITION,
  REG_PRESENT_TEMPERATURE,
  REG_PRESENT_VOLTAGE,
  REG_TORQUE_ENABLE,
} from './registers'

export interface Reading<T> {
  value: T
  /** Byte ERR della risposta: 0 = nessuna anomalia. */
  status: number
}

export interface Telemetry {
  loadRaw: number
  voltageRaw: number
  temperatureRaw: number
  movingRaw: number
  currentRaw: number
}

// Blocco di registri letto dal monitor con una sola richiesta (60..70).
const TELEMETRY_FIELDS = [
  { key: 'loadRaw', address: REG_PRESENT_LOAD, size: 2 },
  { key: 'voltageRaw', address: REG_PRESENT_VOLTAGE, size: 1 },
  { key: 'temperatureRaw', address: REG_PRESENT_TEMPERATURE, size: 1 },
  { key: 'movingRaw', address: REG_MOVING, size: 1 },
  { key: 'currentRaw', address: REG_PRESENT_CURRENT, size: 2 },
] as const satisfies readonly { key: keyof Telemetry; address: number; size: 1 | 2 }[]

const TELEMETRY_START = Math.min(...TELEMETRY_FIELDS.map((f) => f.address))
const TELEMETRY_LENGTH =
  Math.max(...TELEMETRY_FIELDS.map((f) => f.address + f.size)) - TELEMETRY_START

export class Servo {
  constructor(
    private readonly connection: SerialConnection,
    readonly id: number = SERVO_ID,
  ) {}

  /** Restituisce il byte di stato della risposta al ping. */
  async ping(): Promise<number> {
    const response = await this.connection.request(buildPing(this.id))
    return response.status
  }

  async readBytes(address: number, count: number): Promise<Reading<Uint8Array>> {
    const response = await this.connection.request(buildRead(this.id, address, count))
    if (response.data.length !== count) {
      throw new ProtocolError(`Attesi ${count} byte, ricevuti ${response.data.length}`)
    }
    return { value: response.data, status: response.status }
  }

  /** Legge un registro da 1 o 2 byte (2 byte in little endian). */
  async readRegister(address: number, size: 1 | 2): Promise<Reading<number>> {
    const { value, status } = await this.readBytes(address, size)
    return { value: size === 2 ? fromLE16(value) : value[0], status }
  }

  readPosition(): Promise<Reading<number>> {
    return this.readRegister(REG_PRESENT_POSITION, 2)
  }

  /**
   * Scrive la posizione obiettivo, limitata a 0..4095. Restituisce il valore
   * effettivamente inviato e lo stato della risposta.
   */
  async writeGoalPosition(position: number): Promise<Reading<number>> {
    const value = clampPosition(position)
    const response = await this.connection.request(
      buildWrite(this.id, REG_GOAL_POSITION, toLE16(value)),
    )
    return { value, status: response.status }
  }

  /** Abilitazione coppia (registro 40, da confermare sul portale). */
  async setTorqueEnabled(enabled: boolean): Promise<number> {
    const response = await this.connection.request(
      buildWrite(this.id, REG_TORQUE_ENABLE, [enabled ? 1 : 0]),
    )
    return response.status
  }

  /** Carico, tensione, temperatura, movimento e corrente in una sola lettura. */
  async readTelemetry(): Promise<Reading<Telemetry>> {
    const { value: bytes, status } = await this.readBytes(TELEMETRY_START, TELEMETRY_LENGTH)
    const telemetry = {} as Telemetry
    for (const field of TELEMETRY_FIELDS) {
      const offset = field.address - TELEMETRY_START
      telemetry[field.key] = field.size === 2 ? fromLE16(bytes, offset) : bytes[offset]
    }
    return { value: telemetry, status }
  }
}
