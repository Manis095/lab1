import { describe, expect, it } from 'vitest'
import { comparePosition, isWithinTolerance, positionDiff } from './position'

describe('confronto delle posizioni', () => {
  it('differenza con segno sul percorso più corto', () => {
    expect(positionDiff(2048, 2050)).toBe(2)
    expect(positionDiff(2048, 2046)).toBe(-2)
    expect(positionDiff(0, 4095)).toBe(-1)
    expect(positionDiff(4095, 0)).toBe(1)
  })
  it('0 esatto, 1..2 tollerato, oltre lontano', () => {
    expect(comparePosition(2048, 2048).verdict).toBe('exact')
    expect(comparePosition(2048, 2046).verdict).toBe('tolerated')
    expect(comparePosition(2048, 2050).verdict).toBe('tolerated')
    expect(comparePosition(2048, 2051).verdict).toBe('far')
    expect(isWithinTolerance(3072, 3070)).toBe(true)
    expect(isWithinTolerance(3072, 3069)).toBe(false)
  })
  it('segnala il fine corsa tipico dei byte invertiti', () => {
    // 3000 con i byte invertiti diventa 47115: il servo satura a fine corsa.
    expect(comparePosition(3000, 4095).atEndStop).toBe(true)
    expect(comparePosition(3000, 1500).atEndStop).toBe(false)
    expect(comparePosition(4090, 4095).atEndStop).toBe(false)
  })
})
