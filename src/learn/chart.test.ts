import { describe, expect, it } from 'vitest'
import { linePath, nearestIndex, niceTicks, polar, positionToDialAngle, yOf } from './chart'

const frame = { width: 100, height: 50, left: 10, right: 10, top: 5, bottom: 5 }

describe('niceTicks', () => {
  it('tacche tonde che contengono il massimo', () => {
    expect(niceTicks(100)).toEqual([0, 50, 100])
    expect(niceTicks(37)).toEqual([0, 10, 20, 30, 40])
    expect(niceTicks(900)).toEqual([0, 500, 1000])
    expect(niceTicks(3)).toEqual([0, 1, 2, 3])
    expect(niceTicks(0)).toEqual([0, 1])
  })
})

describe('linePath e scale', () => {
  it('primo e ultimo punto ai bordi, valori limitati all’asse', () => {
    const path = linePath([{ t: 0, v: 0 }, { t: 10, v: 100 }], frame, 100)
    expect(path).toBe('M10.0,45.0 L90.0,5.0')
    expect(yOf(150, 100, frame)).toBe(5)
    expect(yOf(-3, 100, frame)).toBe(45)
    expect(linePath([], frame, 1)).toBe('')
  })
  it('campione più vicino al puntatore', () => {
    const pts = [{ t: 0, v: 1 }, { t: 5, v: 2 }, { t: 10, v: 3 }]
    expect(nearestIndex(pts, 12, frame)).toBe(0)
    expect(nearestIndex(pts, 52, frame)).toBe(1)
    expect(nearestIndex(pts, 99, frame)).toBe(2)
    expect(nearestIndex([], 5, frame)).toBe(-1)
  })
})

describe('quadrante', () => {
  it('posizione in gradi, 0 in alto', () => {
    expect(positionToDialAngle(0)).toBe(0)
    expect(positionToDialAngle(1024)).toBe(90)
    expect(positionToDialAngle(2048)).toBe(180)
    const top = polar(50, 50, 40, 0)
    expect(top.x).toBeCloseTo(50)
    expect(top.y).toBeCloseTo(10)
    const right = polar(50, 50, 40, 90)
    expect(right.x).toBeCloseTo(90)
    expect(right.y).toBeCloseTo(50)
  })
})
