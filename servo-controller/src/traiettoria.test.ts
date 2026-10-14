import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { distanza } from './cinematica';
import {
    avviaTraiettoria, inversioni, lineare, percorsoCerchio, puntoDelCerchio, puntoDelSegmento,
    raccordo, sagitta, velocitaMedia, velocitaPicco,
} from './traiettoria';

describe('percorsi', () => {
    test('il cerchio parte e arriva nello stesso punto (s = 0 e s = 1)', () => {
        const c = { x: 150, y: 0 };
        expect(distanza(puntoDelCerchio(0, c, 30), puntoDelCerchio(1, c, 30))).toBeLessThan(1e-9);
    });
    test('tutti i punti stanno alla distanza r dal centro', () => {
        for (let i = 0; i <= 50; i++) expect(distanza(puntoDelCerchio(i / 50, { x: 10, y: 20 }, 30), { x: 10, y: 20 })).toBeCloseTo(30);
    });
    test('segmento: s = 0 è A, s = 1 è B, s = 0.5 è il punto medio', () => {
        const A = { x: 0, y: 0 }, Bp = { x: 100, y: 40 };
        expect(puntoDelSegmento(0, A, Bp)).toEqual(A);
        expect(puntoDelSegmento(1, A, Bp)).toEqual(Bp);
        expect(puntoDelSegmento(0.5, A, Bp)).toEqual({ x: 50, y: 20 });
    });
});

describe('leggi orarie', () => {
    test('raccordo: s(0) = 0, s(1) = 1, s(0.5) = 0.5', () => {
        expect(raccordo(0)).toBe(0); expect(raccordo(1)).toBe(1); expect(raccordo(0.5)).toBeCloseTo(0.5);
    });
    test('raccordo: velocità nulla agli estremi, 1.5 a metà', () => {
        const h = 1e-6;
        expect((raccordo(h) - raccordo(0)) / h).toBeLessThan(1e-3);
        expect((raccordo(0.5 + h) - raccordo(0.5 - h)) / (2 * h)).toBeCloseTo(1.5, 3);
    });
    test("lineare è l'identità", () => { expect(lineare(0.3)).toBe(0.3); });
});

describe('inversioni dei giunti (slide 34)', () => {
    test('trova il massimo, e con chiuso = true anche il punto di partenza', () => {
        expect(inversioni([0, 1, 2, 3, 2, 1, 0])).toEqual([3]);
        expect(inversioni([0, 1, 2, 3, 2, 1, 0], true)).toEqual([0, 3]);
    });
    test('i tratti fermi non creano false inversioni', () => {
        expect(inversioni([0, 1, 1, 1, 2, 3])).toEqual([]);
    });
});

describe('numeri delle slide 26-32', () => {
    test('r = 200, T = 4 s: media 314 mm/s, picco raccordato 471 mm/s', () => {
        expect(velocitaMedia(200, 4)).toBeCloseTo(314.16, 1);
        expect(velocitaPicco(200, 4, 'raccordo')).toBeCloseTo(471.2, 1);
    });
    test('sagitta: r = 200, N = 200 -> 0.025 mm; N = 12 -> 6.8 mm', () => {
        expect(sagitta(200, 200)).toBeCloseTo(0.025, 3);
        expect(sagitta(200, 12)).toBeCloseTo(6.8, 1);
    });
});

describe("ciclo basato sull'orologio", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    test("l'ultimo campione ha s = 1 e il cerchio si chiude, anche se i giri sono lenti", async () => {
        const punti: { x: number; y: number }[] = [];
        const s: number[] = [];
        let fine = false;
        avviaTraiettoria({
            percorso: percorsoCerchio({ x: 150, y: 0 }, 30), legge: raccordo,
            durataMs: 1000, periodoMs: 20,
            ora: () => Date.now(),
            // ogni invio "dura" 35 ms (più del periodo): alcuni giri vengono saltati
            invia: async (p, _t, ss) => { punti.push(p); s.push(ss); await new Promise((r) => setTimeout(r, 35)); },
            onFine: () => { fine = true; },
        });
        await vi.advanceTimersByTimeAsync(2000);
        expect(fine).toBe(true);
        expect(punti.length).toBeLessThan(50); // meno dei 50 previsti: giri saltati
        expect(s[s.length - 1]).toBe(1);
        // l'ultimo punto coincide con la partenza del percorso
        expect(distanza(puntoDelCerchio(0, { x: 150, y: 0 }, 30), punti[punti.length - 1])).toBeLessThan(1e-6);
    });

    test('ferma() interrompe e chiama onFine una volta sola', async () => {
        let chiamate = 0;
        const t = avviaTraiettoria({
            percorso: percorsoCerchio({ x: 150, y: 0 }, 30), legge: lineare,
            durataMs: 1000, periodoMs: 20,
            ora: () => Date.now(), invia: async () => { }, onFine: () => { chiamate++; },
        });
        await vi.advanceTimersByTimeAsync(100);
        t.ferma(); t.ferma();
        await vi.advanceTimersByTimeAsync(2000);
        expect(chiamate).toBe(1);
    });

    test('un errore in invia() ferma tutto e viene riportato', async () => {
        let errore: Error | undefined;
        avviaTraiettoria({
            percorso: percorsoCerchio({ x: 150, y: 0 }, 30), legge: lineare,
            durataMs: 1000, periodoMs: 20,
            ora: () => Date.now(), invia: async () => { throw new Error('servo 2 non risponde'); },
            onFine: (e) => { errore = e; },
        });
        await vi.advanceTimersByTimeAsync(100);
        expect(errore?.message).toBe('servo 2 non risponde');
    });
});