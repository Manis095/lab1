import { describe, expect, it } from 'vitest'
import type { TrafficEvent } from '../serial/connection'
import { buildPing, buildRead, buildWrite, toLE16 } from '../serial/protocol'
import { checksumWorkout, dissectPacket } from './anatomy'
import { applyTraffic, classifyRequest, type ExchangeKey, type ExchangeMap, fromHex } from './exchanges'

const labels = (packet: string, dir: 'TX' | 'RX') => dissectPacket(fromHex(packet), dir).fields.map((f) => f.label)

describe('dissectPacket', () => {
  it('ping ID 1', () => {
    const a = dissectPacket(fromHex('FF FF 01 02 01 FB'), 'TX')
    expect(a.fields.map((f) => f.label)).toEqual(['INTEST', 'INTEST', 'ID', 'LEN', 'ISTR', 'CHK'])
    expect(a.checksumOk).toBe(true)
    expect(a.summary).toBe("Ping all'ID 1")
  })
  it('lettura posizione', () => {
    expect(labels('FF FF 01 04 02 38 02 BE', 'TX')).toEqual(['INTEST', 'INTEST', 'ID', 'LEN', 'ISTR', 'IND', 'N', 'CHK'])
    expect(dissectPacket(fromHex('FF FF 01 04 02 38 02 BE'), 'TX').summary).toBe("Lettura di 2 byte dall'indirizzo 56")
  })
  it('scrittura 2048: dato basso e alto', () => {
    const a = dissectPacket(fromHex('FF FF 01 05 03 2A 00 08 C4'), 'TX')
    expect(a.fields.map((f) => f.label)).toEqual(['INTEST', 'INTEST', 'ID', 'LEN', 'ISTR', 'IND', 'DATO L', 'DATO H', 'CHK'])
    expect(a.summary).toBe("Scrittura di 2 byte all'indirizzo 42 (valore 2048)")
    expect(a.fields[7].description).toMatch(/0 \+ 8 × 256 = 2048/)
  })
  it('risposta con posizione 3060', () => {
    const a = dissectPacket(fromHex('FF FF 01 04 00 F4 0B FB'), 'RX')
    expect(a.fields.map((f) => f.label)).toEqual(['INTEST', 'INTEST', 'ID', 'LEN', 'ERR', 'DATO L', 'DATO H', 'CHK'])
    expect(a.summary).toMatch(/valore 3060/)
    expect(a.checksumOk).toBe(true)
  })
  it('telemetria: dati generici', () => {
    const a = dissectPacket(buildRead(1, 60, 11), 'TX')
    expect(a.summary).toBe("Lettura di 11 byte dall'indirizzo 60")
  })
  it('segnala il checksum sbagliato', () => {
    const a = dissectPacket(fromHex('FF FF 01 02 00 00'), 'RX')
    expect(a.checksumOk).toBe(false)
    expect(a.fields.at(-1)!.description).toMatch(/SBAGLIATO, atteso FC/)
  })
})

describe('checksumWorkout', () => {
  it('ping ID 1: 01 + 02 + 01 = 4, complemento FB', () => {
    const w = checksumWorkout(fromHex('FF FF 01 02 01 FB'))
    expect(w.steps.map((s) => s.sum)).toEqual([1, 3, 4])
    expect(w.sumMod256).toBe(4)
    expect(w.complement).toBe(0xfb)
    expect(w.ok).toBe(true)
  })
  it('somma oltre 255: modulo 256', () => {
    const w = checksumWorkout(fromHex('FF FF 01 05 03 2A 00 08 C4'))
    expect(w.sum).toBe(1 + 5 + 3 + 42 + 0 + 8)
    expect(w.complement).toBe(0xc4)
    const big = checksumWorkout(buildWrite(1, 200, [200, 200]))
    expect(big.sum).toBeGreaterThan(255)
    expect(big.sumMod256).toBe(big.sum % 256)
    expect(big.ok).toBe(true)
  })
})

describe('exchanges', () => {
  const ev = (kind: TrafficEvent['kind'], bytes?: Uint8Array): TrafficEvent => ({
    kind,
    time: 1,
    text: '',
    alarm: false,
    hex: bytes ? Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ') : undefined,
  })

  it('classifica le richieste', () => {
    expect(classifyRequest(buildPing(1))).toBe('ping')
    expect(classifyRequest(buildWrite(1, 42, toLE16(2048)))).toBe('goal')
    expect(classifyRequest(buildRead(1, 56, 2))).toBe('position')
    expect(classifyRequest(buildRead(1, 60, 11))).toBe('telemetry')
    expect(classifyRequest(buildRead(1, 60, 2))).toBe('other')
  })

  it('associa la risposta alla richiesta e segna quelle senza risposta', () => {
    let state: { map: ExchangeMap; current: ExchangeKey | null } = { map: {}, current: null }
    state = applyTraffic(state.map, state.current, ev('TX', buildPing(1)))
    expect(state.map.ping?.state).toBe('pending')
    state = applyTraffic(state.map, state.current, ev('RX', fromHex('FF FF 01 02 00 FC')))
    expect(state.map.ping?.state).toBe('answered')
    expect(state.map.ping?.rx).toEqual(fromHex('FF FF 01 02 00 FC'))
    state = applyTraffic(state.map, state.current, ev('TX', buildRead(1, 56, 2)))
    state = applyTraffic(state.map, state.current, ev('TX', buildRead(1, 60, 11)))
    expect(state.map.position?.state).toBe('unanswered')
    expect(state.map.telemetry?.state).toBe('pending')
    // Eventi senza byte non cambiano nulla.
    const same = applyTraffic(state.map, state.current, ev('INFO'))
    expect(same.map).toBe(state.map)
  })
})

describe('contenuti del ripasso', async () => {
  const { LEARN_TOPICS, TAG_LABELS } = await import('./content')
  const text = JSON.stringify(LEARN_TOPICS)

  it('niente trattini lunghi', () => {
    expect(text).not.toMatch(/[–—]/)
  })

  it('ogni affermazione ha una delle tre etichette', () => {
    for (const topic of Object.values(LEARN_TOPICS)) {
      for (const section of topic.sections) {
        for (const block of section.blocks) {
          const tags = block.kind === 'claims' ? block.items.map((c) => c.tag) : block.kind === 'steps' ? [block.tag] : []
          for (const tag of tags) expect(Object.keys(TAG_LABELS)).toContain(tag)
          if (block.kind === 'claims') for (const c of block.items) expect(c.text.length).toBeGreaterThan(10)
        }
      }
    }
  })

  it('non riproduce le due imprecisioni delle slide', () => {
    expect(text).toMatch(/non sono un'isteresi/)
    expect(text).toMatch(/full duplex solo a livello logico/)
  })
})
