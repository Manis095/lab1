import { describe, expect, it } from 'vitest'
import { PacketParser } from './parser'
import { toHex } from './protocol'

const hex = (s: string) => Uint8Array.from(s.split(' '), (b) => parseInt(b, 16))
const hexList = (packets: Uint8Array[]) => packets.map(toHex)

describe('PacketParser', () => {
  it('pacchetto in tre pezzi, FF FF finale resta nel buffer', () => {
    const p = new PacketParser()
    expect(p.feed(hex('FF FF 01'))).toEqual([])
    expect(p.feed(hex('02 01'))).toEqual([])
    expect(hexList(p.feed(hex('FB FF FF')))).toEqual(['FF FF 01 02 01 FB'])
    expect(toHex(p.pending)).toBe('FF FF')
  })

  it('due pacchetti in un solo blocco', () => {
    const p = new PacketParser()
    const out = p.feed(hex('FF FF 01 02 00 FC FF FF 01 04 00 F4 0B FB'))
    expect(hexList(out)).toEqual(['FF FF 01 02 00 FC', 'FF FF 01 04 00 F4 0B FB'])
    expect(p.pending.length).toBe(0)
  })

  it('byte spazzatura davanti', () => {
    const p = new PacketParser()
    const out = p.feed(hex('00 13 FF 7A FF FF 01 02 00 FC'))
    expect(hexList(out)).toEqual(['FF FF 01 02 00 FC'])
    expect(p.discardedBytes).toBe(4)
  })

  it('checksum sbagliato seguito da un pacchetto valido', () => {
    const p = new PacketParser()
    const out = p.feed(hex('FF FF 01 02 00 00 FF FF 02 02 00 FB'))
    expect(hexList(out)).toEqual(['FF FF 02 02 00 FB'])
    expect(p.pending.length).toBe(0)
  })

  it('FF FF dentro i dati non confonde il parser', () => {
    // Un falso inizio "FF FF" seguito dal pacchetto vero.
    const p = new PacketParser()
    const out = p.feed(hex('FF FF FF 01 02 00 FC'))
    expect(hexList(out)).toEqual(['FF FF 01 02 00 FC'])
  })

  it('un byte alla volta', () => {
    const p = new PacketParser()
    const all: Uint8Array[] = []
    for (const b of hex('FF FF 02 04 00 FE 07 F4')) all.push(...p.feed(Uint8Array.of(b)))
    expect(hexList(all)).toEqual(['FF FF 02 04 00 FE 07 F4'])
  })

  it('LEN troppo piccolo viene scartato', () => {
    const p = new PacketParser()
    const out = p.feed(hex('FF FF 01 00 FF FF 01 02 00 FC'))
    expect(hexList(out)).toEqual(['FF FF 01 02 00 FC'])
  })
})
