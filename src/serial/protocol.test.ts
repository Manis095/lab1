import { describe, expect, it } from 'vitest'
import {
  buildPing,
  buildRead,
  buildWrite,
  checksum,
  fromLE16,
  parseResponse,
  ProtocolError,
  toHex,
  toLE16,
} from './protocol'

// Converte "FF FF 01" in Uint8Array.
const hex = (s: string) => Uint8Array.from(s.split(' '), (b) => parseInt(b, 16))

describe('checksum', () => {
  it('01 02 01 -> FB', () => {
    expect(checksum(hex('01 02 01'))).toBe(0xfb)
  })
})

describe('costruzione dei comandi (vettori verificati)', () => {
  it('ping ID 1', () => {
    expect(toHex(buildPing(1))).toBe('FF FF 01 02 01 FB')
  })
  it('ping ID 2', () => {
    expect(toHex(buildPing(2))).toBe('FF FF 02 02 01 FA')
  })
  it('lettura posizione ID 1 (reg 56, 2 byte)', () => {
    expect(toHex(buildRead(1, 56, 2))).toBe('FF FF 01 04 02 38 02 BE')
  })
  it('lettura posizione ID 2', () => {
    expect(toHex(buildRead(2, 56, 2))).toBe('FF FF 02 04 02 38 02 BD')
  })
  it('scrittura 2048 al reg 42, ID 1', () => {
    expect(toHex(buildWrite(1, 42, toLE16(2048)))).toBe('FF FF 01 05 03 2A 00 08 C4')
  })
  it('restituisce sempre Uint8Array', () => {
    expect(buildPing(1)).toBeInstanceOf(Uint8Array)
    expect(buildRead(1, 56, 2)).toBeInstanceOf(Uint8Array)
    expect(buildWrite(1, 42, [0, 8])).toBeInstanceOf(Uint8Array)
  })
  it('rifiuta ID, indirizzi e dati fuori range', () => {
    expect(() => buildPing(255)).toThrow(ProtocolError)
    expect(() => buildPing(-1)).toThrow(ProtocolError)
    expect(() => buildRead(1, 256, 2)).toThrow(ProtocolError)
    expect(() => buildRead(1, 56, 0)).toThrow(ProtocolError)
    expect(() => buildWrite(1, 42, [])).toThrow(ProtocolError)
    expect(() => buildWrite(1, 42, [300])).toThrow(ProtocolError)
  })
})

describe('little endian', () => {
  it('3000 -> B8 0B', () => {
    expect(toHex(toLE16(3000))).toBe('B8 0B')
  })
  it('invertire i byte darebbe 47115', () => {
    expect(fromLE16(hex('0B B8'))).toBe(47115)
    expect(fromLE16(hex('B8 0B'))).toBe(3000)
  })
  it('andata e ritorno', () => {
    for (const v of [0, 1, 255, 256, 2048, 4095, 65535]) expect(fromLE16(toLE16(v))).toBe(v)
  })
  it('rifiuta valori fuori da 16 bit', () => {
    expect(() => toLE16(65536)).toThrow(ProtocolError)
    expect(() => toLE16(-1)).toThrow(ProtocolError)
    expect(() => toLE16(1.5)).toThrow(ProtocolError)
  })
})

describe('parseResponse (vettori verificati)', () => {
  it('risposta al ping ID 1', () => {
    const r = parseResponse(hex('FF FF 01 02 00 FC'))
    expect(r).toEqual({ id: 1, status: 0, data: new Uint8Array(0) })
  })
  it('risposta al ping ID 2', () => {
    const r = parseResponse(hex('FF FF 02 02 00 FB'))
    expect(r.id).toBe(2)
    expect(r.status).toBe(0)
  })
  it('posizione 3060 da ID 1', () => {
    const r = parseResponse(hex('FF FF 01 04 00 F4 0B FB'))
    expect(r.id).toBe(1)
    expect(r.status).toBe(0)
    expect(fromLE16(r.data)).toBe(3060)
  })
  it('posizione 2046 da ID 2', () => {
    const r = parseResponse(hex('FF FF 02 04 00 FE 07 F4'))
    expect(r.id).toBe(2)
    expect(fromLE16(r.data)).toBe(2046)
  })
  it('risposta alla scrittura', () => {
    expect(parseResponse(hex('FF FF 01 02 00 FC')).status).toBe(0)
  })
  it('restituisce lo stato anche se diverso da zero', () => {
    // FF FF 01 02 20 CHK, con ERR = 0x20
    const body = hex('01 02 20')
    const packet = Uint8Array.from([0xff, 0xff, ...body, checksum(body)])
    expect(parseResponse(packet).status).toBe(0x20)
  })
  it('rifiuta checksum, intestazione e lunghezza errati', () => {
    expect(() => parseResponse(hex('FF FF 01 02 00 FD'))).toThrow(/Checksum/)
    expect(() => parseResponse(hex('FE FF 01 02 00 FC'))).toThrow(/Intestazione/)
    expect(() => parseResponse(hex('FF FF 01 03 00 FC'))).toThrow(/Lunghezza/)
    expect(() => parseResponse(hex('FF FF 01'))).toThrow(/corto/)
  })
})
