// Registri letti dal bottone "Diagnostica", con conversione e valori attesi a
// servo fermo. Servono a confermare sperimentalmente la tabella di terze parti:
// se i valori grezzi non tornano, l'indirizzo o la conversione sono sbagliati.

import {
  currentToMilliamps,
  decodeLoad,
  positionToDegrees,
  REG_MOVING,
  REG_PRESENT_CURRENT,
  REG_PRESENT_LOAD,
  REG_PRESENT_POSITION,
  REG_PRESENT_TEMPERATURE,
  REG_PRESENT_VOLTAGE,
  voltageToVolts,
} from './registers'

export interface DiagnosticRegister {
  address: number
  size: 1 | 2
  name: string
  source: 'lezione' | 'terze parti'
  convert: (raw: number) => string
  /** Valore atteso a servo fermo, a parole. */
  expected: string
  /** Verifica del valore grezzo a servo fermo; assente se non c'è un'attesa. */
  check?: (raw: number) => boolean
}

const fmt = (value: number, digits = 1) =>
  value.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits })

// Soglie delle verifiche a servo fermo.
export const IDLE_VOLTAGE_RAW_MIN = 110 // 11,0 V
export const IDLE_VOLTAGE_RAW_MAX = 130 // 13,0 V
export const IDLE_TEMPERATURE_MIN = 20
export const IDLE_TEMPERATURE_MAX = 45
export const IDLE_LOAD_MAX = 50 // 5% della coppia massima

export function formatLoad(raw: number): string {
  const load = decodeLoad(raw)
  const text = `${fmt(load.percent)}% (valore ${load.value}, direzione ${load.direction})`
  return load.plausible ? text : `${text}, FORMATO NON PLAUSIBILE`
}

export const DIAGNOSTIC_REGISTERS: readonly DiagnosticRegister[] = [
  {
    address: REG_PRESENT_POSITION,
    size: 2,
    name: 'Posizione attuale',
    source: 'lezione',
    convert: (raw) => `${fmt(positionToDegrees(raw))}°`,
    expected: '0..4095',
    check: (raw) => raw <= 4095,
  },
  {
    address: REG_PRESENT_LOAD,
    size: 2,
    name: 'Carico',
    source: 'terze parti',
    convert: formatLoad,
    expected: `vicino a 0 (≤ ${IDLE_LOAD_MAX} grezzo, cioè ≤ 5%)`,
    check: (raw) => decodeLoad(raw).plausible && decodeLoad(raw).value <= IDLE_LOAD_MAX,
  },
  {
    address: REG_PRESENT_VOLTAGE,
    size: 1,
    name: 'Tensione',
    source: 'terze parti',
    convert: (raw) => `${fmt(voltageToVolts(raw))} V`,
    expected: `circa 120 con alimentatore a 12 V (${IDLE_VOLTAGE_RAW_MIN}..${IDLE_VOLTAGE_RAW_MAX})`,
    check: (raw) => raw >= IDLE_VOLTAGE_RAW_MIN && raw <= IDLE_VOLTAGE_RAW_MAX,
  },
  {
    address: REG_PRESENT_TEMPERATURE,
    size: 1,
    name: 'Temperatura',
    source: 'terze parti',
    convert: (raw) => `${raw} °C`,
    expected: `${IDLE_TEMPERATURE_MIN}..${IDLE_TEMPERATURE_MAX} °C`,
    check: (raw) => raw >= IDLE_TEMPERATURE_MIN && raw <= IDLE_TEMPERATURE_MAX,
  },
  {
    address: REG_MOVING,
    size: 1,
    name: 'In movimento',
    source: 'terze parti',
    convert: (raw) => (raw === 0 ? 'fermo' : raw === 1 ? 'in movimento' : 'valore inatteso'),
    expected: '0 (fermo)',
    check: (raw) => raw === 0,
  },
  {
    address: REG_PRESENT_CURRENT,
    size: 2,
    name: 'Corrente',
    source: 'terze parti',
    convert: (raw) => `${fmt(currentToMilliamps(raw))} mA`,
    expected: 'bassa a servo fermo (nessuna soglia nota)',
  },
]
