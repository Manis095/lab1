import { describe, expect, it } from 'vitest'
import { TimeoutError } from './connection'
import { type PositionActuator, runSequence, type SequenceEvent } from './sequence'

/** Servo simulato: a ogni lettura si avvicina all'obiettivo di `speed` unità. */
class FakeActuator implements PositionActuator {
  goal = 0
  writes: number[] = []
  reads = 0
  constructor(
    public position = 2048,
    public speed = 500,
    public failEveryRead = 0,
  ) {}
  async writeGoalPosition(position: number) {
    const value = Math.min(4095, Math.max(0, position))
    this.goal = value
    this.writes.push(value)
    return { value, status: 0 }
  }
  async readPosition() {
    this.reads++
    if (this.failEveryRead && this.reads % this.failEveryRead === 0) {
      throw new TimeoutError('timeout simulato')
    }
    const delta = this.goal - this.position
    this.position += Math.sign(delta) * Math.min(Math.abs(delta), this.speed)
    return { value: this.position, status: 0 }
  }
}

describe('runSequence', () => {
  it('esegue tutte le posizioni e passa alla successiva solo dopo l’arrivo', async () => {
    const servo = new FakeActuator(2048, 1000)
    const events: SequenceEvent[] = []
    const result = await runSequence(servo, [1024, 3072, 2048], {
      signal: new AbortController().signal,
      pollMs: 1,
      onEvent: (e) => events.push(e),
    })
    expect(result).toBe('completed')
    expect(servo.writes).toEqual([1024, 3072, 2048])
    const done = events.filter((e) => e.type === 'done')
    expect(done.map((e) => e.type === 'done' && e.outcome.kind)).toEqual([
      'arrived',
      'arrived',
      'arrived',
    ])
  })

  it('accetta la tolleranza di 2 unità', async () => {
    const servo = new FakeActuator(2048, 1000)
    servo.readPosition = async () => ({ value: servo.goal + 2, status: 0 })
    const events: SequenceEvent[] = []
    await runSequence(servo, [1000], {
      signal: new AbortController().signal,
      pollMs: 1,
      onEvent: (e) => events.push(e),
    })
    expect(events.at(-1)).toMatchObject({ type: 'done', outcome: { kind: 'arrived', position: 1002 } })
  })

  it('servo bloccato: timeout e poi prosegue', async () => {
    const servo = new FakeActuator(2048, 0)
    const events: SequenceEvent[] = []
    const result = await runSequence(servo, [1024, 3072], {
      signal: new AbortController().signal,
      pollMs: 1,
      arrivalTimeoutMs: 20,
      onEvent: (e) => events.push(e),
    })
    expect(result).toBe('completed')
    expect(servo.writes).toEqual([1024, 3072])
    const done = events.filter((e) => e.type === 'done')
    expect(done.map((e) => e.type === 'done' && e.outcome)).toMatchObject([
      { kind: 'timeout', position: 2048 },
      { kind: 'timeout', position: 2048 },
    ])
  })

  it('timeout di lettura sporadici non fermano la sequenza', async () => {
    const servo = new FakeActuator(2048, 300, 2)
    const result = await runSequence(servo, [512, 3072], {
      signal: new AbortController().signal,
      pollMs: 1,
    })
    expect(result).toBe('completed')
    expect(servo.position).toBe(3072)
  })

  it('interruzione immediata: nessuna scrittura dopo lo stop', async () => {
    const servo = new FakeActuator(2048, 1)
    const controller = new AbortController()
    const started = Date.now()
    const running = runSequence(servo, [1024, 3072, 2048], {
      signal: controller.signal,
      pollMs: 50,
    })
    await new Promise((r) => setTimeout(r, 10))
    controller.abort()
    expect(await running).toBe('aborted')
    expect(Date.now() - started).toBeLessThan(100)
    expect(servo.writes).toEqual([1024])
  })
})
