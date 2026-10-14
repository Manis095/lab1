import { describe, expect, test } from 'vitest';
import { Bus, type Canale } from './bus';
import { calcolaChecksum, creaPacchettoPosizioneVelocita, ParserSTS, type RispostaServo } from './protocollo';
import { leggiTelemetria, muoviServo } from './servo';

class ServoFinti implements Canale {
    private ascoltatori: ((p: RispostaServo) => boolean | void)[] = [];
    private parser = new ParserSTS();
    registri = new Map<number, Uint8Array>();

    constructor(ids: number[]) {
        for (const id of ids) {
            const r = new Uint8Array(256);
            r[0x38] = 0x00; r[0x39] = 0x08; r[0x3e] = 121; r[0x3f] = 30 + id; // 2048 step, 12.1 V, 31/32 °C
            this.registri.set(id, r);
        }
    }

    aggiungiAscoltatore(a: (p: RispostaServo) => boolean | void) { this.ascoltatori.push(a); }

    async invia(p: Uint8Array) {
        const [, , id, , istr, ...resto] = Array.from(p);
        const reg = this.registri.get(id);
        if (!reg) return; // ID inesistente: silenzio
        let dati: number[] = [];
        if (istr === 0x02) dati = Array.from(reg.slice(resto[0], resto[0] + resto[1]));
        if (istr === 0x03) {
            const [ind, ...v] = resto.slice(0, -1);
            v.forEach((x, i) => (reg[ind + i] = x));
            if (ind === 0x2a) { reg[0x38] = reg[0x2a]; reg[0x39] = reg[0x2b]; } // arriva subito
        }
        const corpo = [id, dati.length + 2, 0, ...dati];
        const risposta = [0xff, 0xff, ...corpo, calcolaChecksum(corpo)];
        const meta = Math.ceil(risposta.length / 2);
        queueMicrotask(() => {
            for (const chunk of [risposta.slice(0, meta), risposta.slice(meta)]) {
                for (const pacchetto of this.parser.alimenta(Uint8Array.from(chunk))) {
                    for (const a of this.ascoltatori) a(pacchetto);
                }
            }
        });
    }
}

describe('bus con due servo', () => {
    test("ping: rispondono ID 1 e 2, l'ID 3 va in timeout", async () => {
        const bus = new Bus(new ServoFinti([1, 2]));
        expect(await bus.ping(1)).toBe(true);
        expect(await bus.ping(2)).toBe(true);
        expect(await bus.ping(3)).toBe(false);
    });

    test('una posizione diversa per servo, riletta senza confonderle', async () => {
        const bus = new Bus(new ServoFinti([1, 2]));
        await muoviServo(bus, 1, 3000, 1000);
        await muoviServo(bus, 2, 1500, 1000);
        expect((await leggiTelemetria(bus, 1)).posizione).toBe(3000);
        expect((await leggiTelemetria(bus, 2)).posizione).toBe(1500);
    });

    test('richieste lanciate insieme vanno in coda e non si mescolano', async () => {
        const bus = new Bus(new ServoFinti([1, 2]));
        await Promise.all([muoviServo(bus, 1, 100, 500), muoviServo(bus, 2, 200, 500)]);
        const [a, b] = await Promise.all([leggiTelemetria(bus, 1), leggiTelemetria(bus, 2)]);
        expect([a.posizione, b.posizione]).toEqual([100, 200]);
        expect([a.temperatura, b.temperatura]).toEqual([31, 32]);
    });
});

describe('il bus riconosce chi parla', () => {
    test('una risposta con un altro ID non viene presa per buona', async () => {
        const ascoltatori: ((p: RispostaServo) => boolean | void)[] = [];
        const parser = new ParserSTS();
        const pacchetto = (id: number, dati: number[]) => {
            const corpo = [id, dati.length + 2, 0, ...dati];
            return [0xff, 0xff, ...corpo, calcolaChecksum(corpo)];
        };
        const canale: Canale = {
            aggiungiAscoltatore: (a) => { ascoltatori.push(a); },
            invia: async () => {
                // prima arriva (per errore) un pacchetto del servo 2, poi la risposta vera del servo 1
                const byte = [...pacchetto(2, [0xaa, 0xbb]), ...pacchetto(1, [0x00, 0x08])];
                queueMicrotask(() => {
                    for (const p of parser.alimenta(Uint8Array.from(byte))) for (const a of ascoltatori) a(p);
                });
            },
        };
        const bus = new Bus(canale);
        expect(await bus.leggi(1, 0x38, 2)).toEqual([0x00, 0x08]);
    });
});

describe('difesa contro NaN', () => {
    test('rifiuta NaN invece di mandare uno 0', () => {
        expect(() => creaPacchettoPosizioneVelocita(1, NaN, 1000)).toThrow();
        expect(() => creaPacchettoPosizioneVelocita(1, 2048, Infinity)).toThrow();
    });
    test('posizione fuori scala saturata a 0..4095', () => {
        const alto = Array.from(creaPacchettoPosizioneVelocita(1, 9999, 1000));
        const basso = Array.from(creaPacchettoPosizioneVelocita(1, -50, 1000));
        expect(alto[6] | (alto[7] << 8)).toBe(4095);
        expect(basso[6] | (basso[7] << 8)).toBe(0);
    });
});