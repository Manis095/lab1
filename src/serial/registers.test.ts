import { describe, expect, it } from 'vitest'
import {
  assertWritable,
  clampPosition,
  currentToMilliamps,
  decodeLoad,
  positionToDegrees,
  REG_EEPROM_LOCK,
  REG_GOAL_POSITION,
  REG_TORQUE_ENABLE,
  UnsafeWriteError,
  voltageToVolts,
} from './registers'
import { describeStatus, formatStatus } from './status'

describe('assertWritable', () => {
  it('permette posizione obiettivo e abilitazione coppia', () => {
    expect(() => assertWritable(REG_GOAL_POSITION, 2)).not.toThrow()
    expect(() => assertWritable(REG_TORQUE_ENABLE, 1)).not.toThrow()
  })
  it('vieta tutto sotto 40 (EEPROM: ID, baud rate...)', () => {
    for (const addr of [0, 5, 6, 7, 36, 39]) {
      expect(() => assertWritable(addr, 1)).toThrow(UnsafeWriteError)
    }
    // Parte da 39 e sconfina in 40: vietata comunque.
    expect(() => assertWritable(39, 2)).toThrow(UnsafeWriteError)
  })
  it('vieta il registro 55 anche dentro un intervallo più ampio', () => {
    expect(() => assertWritable(REG_EEPROM_LOCK, 1)).toThrow(UnsafeWriteError)
    expect(() => assertWritable(54, 2)).toThrow(UnsafeWriteError)
    expect(() => assertWritable(50, 10)).toThrow(UnsafeWriteError)
    expect(() => assertWritable(53, 2)).not.toThrow()
    expect(() => assertWritable(56, 2)).not.toThrow()
  })
  it('rifiuta lunghezze non valide', () => {
    expect(() => assertWritable(42, 0)).toThrow(UnsafeWriteError)
  })
})

describe('posizione', () => {
  it('limita tra 0 e 4095', () => {
    expect(clampPosition(-10)).toBe(0)
    expect(clampPosition(5000)).toBe(4095)
    expect(clampPosition(47115)).toBe(4095)
    expect(clampPosition(2047.6)).toBe(2048)
    expect(clampPosition(NaN)).toBe(0)
  })
  it('converte in gradi', () => {
    expect(positionToDegrees(0)).toBe(0)
    expect(positionToDegrees(2048)).toBe(180)
    expect(positionToDegrees(1024)).toBe(90)
  })
})

describe('decodeLoad', () => {
  it('valore nei bit 0..9, direzione nel bit 10', () => {
    expect(decodeLoad(0)).toEqual({ value: 0, percent: 0, direction: 0, plausible: true })
    expect(decodeLoad(500)).toMatchObject({ value: 500, percent: 50, direction: 0 })
    expect(decodeLoad(1024 + 250)).toMatchObject({ value: 250, percent: 25, direction: 1 })
    expect(decodeLoad(1000)).toMatchObject({ percent: 100, plausible: true })
  })
  it('segnala valori fuori formato', () => {
    expect(decodeLoad(1010).plausible).toBe(false)
    expect(decodeLoad(0x0800).plausible).toBe(false)
  })
})

describe('altre conversioni', () => {
  it('tensione 120 -> 12 V, corrente 10 -> 65 mA', () => {
    expect(voltageToVolts(120)).toBeCloseTo(12)
    expect(currentToMilliamps(10)).toBeCloseTo(65)
  })
})

describe('stato', () => {
  it('0 è nessuna anomalia', () => {
    expect(describeStatus(0)).toMatchObject({ ok: true, hex: '00', flags: [] })
  })
  it('mostra sempre il valore grezzo', () => {
    const d = describeStatus(0x21)
    expect(d.ok).toBe(false)
    expect(d.hex).toBe('21')
    expect(d.flags).toHaveLength(2)
    expect(formatStatus(0x21)).toMatch(/21.*da verificare/)
  })
})
