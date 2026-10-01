// Mappa dei registri del servo Feetech STS (ID 1 in laboratorio) e loro conversioni.
// Tutti gli indirizzi stanno in questo file: se il portale del corso dice
// qualcosa di diverso, si corregge solo qui.
//
// Fonti:
// - [lezione] indirizzi presentati a lezione.
// - [terze parti] tabella di terze parti dell'STS3215, da confermare sul portale
//   del corso (cartella con il disegno meccanico del motore).

// ---- Registri -------------------------------------------------------------

/** [terze parti] Abilitazione coppia, 1 byte: 0 spento, 1 attivo. */
export const REG_TORQUE_ENABLE = 40

/** [lezione] Posizione obiettivo, 2 byte little endian, 0..4095. */
export const REG_GOAL_POSITION = 42

/**
 * [terze parti] Blocco scrittura EEPROM, 1 byte. NON SCRIVERE MAI: azzerarlo
 * sblocca la scrittura della EEPROM (ID, baud rate...). La connessione lo vieta.
 */
export const REG_EEPROM_LOCK = 55

/** [lezione] Posizione attuale, 2 byte little endian, 0..4095. */
export const REG_PRESENT_POSITION = 56

/** [terze parti] Carico attuale, 2 byte: bit 0..9 valore (0..1000 = 0..100%), bit 10 direzione. */
export const REG_PRESENT_LOAD = 60

/** [terze parti] Tensione di alimentazione, 1 byte, unità da 0,1 V. */
export const REG_PRESENT_VOLTAGE = 62

/** [terze parti] Temperatura interna, 1 byte, in °C. */
export const REG_PRESENT_TEMPERATURE = 63

/** [terze parti] In movimento, 1 byte: 1 se il servo si sta muovendo. */
export const REG_MOVING = 66

/** [terze parti] Corrente assorbita, 2 byte little endian, unità da 6,5 mA. */
export const REG_PRESENT_CURRENT = 69

// ---- Sicurezza: aree vietate in scrittura ---------------------------------

// [terze parti] L'EEPROM va da 0 a 36; per prudenza vietiamo tutto sotto 40.
export const EEPROM_LAST_ADDRESS = 36
export const FIRST_WRITABLE_ADDRESS = 40

/** Indirizzi mai scrivibili anche se sopra FIRST_WRITABLE_ADDRESS. */
export const FORBIDDEN_WRITE_ADDRESSES: readonly number[] = [REG_EEPROM_LOCK]

export class UnsafeWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeWriteError'
  }
}

/**
 * Lancia UnsafeWriteError se una scrittura di `length` byte a partire da
 * `address` tocca l'area sotto FIRST_WRITABLE_ADDRESS o un indirizzo vietato.
 * Controlla l'intero intervallo: 2 byte da 54 toccano anche il 55.
 */
export function assertWritable(address: number, length: number): void {
  if (!Number.isInteger(address) || !Number.isInteger(length) || length < 1) {
    throw new UnsafeWriteError(`Scrittura non valida: indirizzo ${address}, ${length} byte`)
  }
  const last = address + length - 1
  if (address < FIRST_WRITABLE_ADDRESS) {
    throw new UnsafeWriteError(
      `Scrittura vietata all'indirizzo ${address}: sotto ${FIRST_WRITABLE_ADDRESS} c'è l'area EEPROM (ID, baud rate...)`,
    )
  }
  for (const forbidden of FORBIDDEN_WRITE_ADDRESSES) {
    if (forbidden >= address && forbidden <= last) {
      throw new UnsafeWriteError(
        `Scrittura vietata: gli indirizzi ${address}..${last} comprendono il registro ${forbidden} (blocco EEPROM)`,
      )
    }
  }
}

// ---- Posizione ------------------------------------------------------------

export const POSITION_MIN = 0
export const POSITION_MAX = 4095
/** Unità per giro completo: 360° / 4096 ≈ 0,088° per unità. */
export const POSITION_UNITS_PER_TURN = 4096
/** Differenza obiettivo/lettura considerata normale (gioco degli ingranaggi). */
export const POSITION_TOLERANCE = 2

/** Limita la posizione a un intero tra 0 e 4095. */
export function clampPosition(value: number): number {
  if (!Number.isFinite(value)) return POSITION_MIN
  return Math.min(POSITION_MAX, Math.max(POSITION_MIN, Math.round(value)))
}

export function positionToDegrees(position: number): number {
  return (position * 360) / POSITION_UNITS_PER_TURN
}

// ---- Conversioni [terze parti] --------------------------------------------

export const LOAD_VALUE_MASK = 0x3ff
export const LOAD_DIRECTION_BIT = 10
export const LOAD_FULL_SCALE = 1000
export const VOLTAGE_UNIT_V = 0.1
export const CURRENT_UNIT_MA = 6.5

export interface DecodedLoad {
  /** Valore grezzo a 10 bit (0..1000 atteso). */
  value: number
  /** Percentuale della coppia massima. */
  percent: number
  /** Bit 10: 0 o 1. Quale verso corrisponda a quale bit è da verificare. */
  direction: 0 | 1
  /** false se il valore supera 1000 o ci sono bit alti inattesi: formato da ricontrollare. */
  plausible: boolean
}

export function decodeLoad(raw: number): DecodedLoad {
  const value = raw & LOAD_VALUE_MASK
  const direction = ((raw >> LOAD_DIRECTION_BIT) & 1) as 0 | 1
  const unexpectedBits = raw >> (LOAD_DIRECTION_BIT + 1)
  return {
    value,
    percent: (value * 100) / LOAD_FULL_SCALE,
    direction,
    plausible: value <= LOAD_FULL_SCALE && unexpectedBits === 0,
  }
}

export function voltageToVolts(raw: number): number {
  return raw * VOLTAGE_UNIT_V
}

export function currentToMilliamps(raw: number): number {
  return raw * CURRENT_UNIT_MA
}
