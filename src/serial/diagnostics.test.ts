import { describe, expect, it } from 'vitest'
import { DIAGNOSTIC_REGISTERS, formatLoad } from './diagnostics'
import { sleep } from './timing'

const byAddress = (address: number) => DIAGNOSTIC_REGISTERS.find((r) => r.address === address)!

describe('registri di diagnostica', () => {
  it('legge gli indirizzi richiesti: 56, 60, 62, 63, 66, 69', () => {
    expect(DIAGNOSTIC_REGISTERS.map((r) => r.address)).toEqual([56, 60, 62, 63, 66, 69])
  })
  it('conversioni', () => {
    expect(byAddress(62).convert(120)).toBe('12,0 V')
    expect(byAddress(63).convert(31)).toBe('31 °C')
    expect(byAddress(69).convert(10)).toBe('65,0 mA')
    expect(byAddress(56).convert(2048)).toBe('180,0°')
    expect(byAddress(66).convert(0)).toBe('fermo')
  })
  it('valori attesi a servo fermo', () => {
    expect(byAddress(62).check!(120)).toBe(true)
    expect(byAddress(62).check!(60)).toBe(false)
    expect(byAddress(63).check!(30)).toBe(true)
    expect(byAddress(63).check!(70)).toBe(false)
    expect(byAddress(60).check!(3)).toBe(true)
    expect(byAddress(60).check!(1024 + 3)).toBe(true)
    expect(byAddress(60).check!(400)).toBe(false)
    expect(byAddress(66).check!(0)).toBe(true)
    expect(byAddress(66).check!(1)).toBe(false)
  })
  it('carico fuori formato segnalato', () => {
    expect(formatLoad(1024 + 250)).toBe('25,0% (valore 250, direzione 1)')
    expect(formatLoad(1010)).toMatch(/NON PLAUSIBILE/)
  })
})

describe('sleep', () => {
  it('termina subito se annullato', async () => {
    const controller = new AbortController()
    const start = Date.now()
    const p = sleep(1000, controller.signal)
    controller.abort()
    expect(await p).toBe(false)
    expect(Date.now() - start).toBeLessThan(100)
  })
  it('completa l’attesa se non annullato', async () => {
    expect(await sleep(5)).toBe(true)
  })
})
