import { describe, expect, test } from 'vitest';
import {
    cinematicaDiretta, cinematicaInversa, distanza, radiantiInStep, stepDaPunta, stepInRadianti,
    type Giunto, type Limiti,
} from './cinematica';

const deg = (rad: number) => (rad * 180) / Math.PI;

const B = { L1: 100, L2: 100 };
const g1: Giunto = { id: 1, offset: 2048, verso: 1 };
const g2: Giunto = { id: 2, offset: 2048, verso: -1 }; // montato al contrario

describe('cinematica diretta: i tre casi della lezione 3', () => {
    test('bracci allineati con x', () => {
        const p = cinematicaDiretta({ t1: 0, t2: 0 }, B);
        expect(p.x).toBeCloseTo(200); expect(p.y).toBeCloseTo(0);
    });
    test('bracci allineati con y', () => {
        const p = cinematicaDiretta({ t1: Math.PI / 2, t2: 0 }, B);
        expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(200);
    });
    test('bracci a squadra', () => {
        const p = cinematicaDiretta({ t1: 0, t2: Math.PI / 2 }, B);
        expect(p.x).toBeCloseTo(100); expect(p.y).toBeCloseTo(100);
    });
});

describe('step <-> radianti', () => {
    test('3072 step = 90 gradi, 0 rad = 2048 step', () => {
        expect(stepInRadianti(3072, g1)).toBeCloseTo(Math.PI / 2);
        expect(radiantiInStep(0, g1)).toBe(2048);
    });
    test('verso -1 inverte il segno', () => {
        expect(stepInRadianti(3072, g2)).toBeCloseTo(-Math.PI / 2);
    });
    test('andata e ritorno: errore massimo mezzo step', () => {
        for (let i = 0; i < 1000; i++) {
            const rad = (Math.random() - 0.5) * 2 * Math.PI;
            for (const g of [g1, g2])
                expect(Math.abs(stepInRadianti(radiantiInStep(rad, g), g) - rad)).toBeLessThan(0.00077);
        }
    });
});

describe('cinematica inversa', () => {
    test('esempio numerico della slide 11: (120, 90) con L1 = L2 = 100', () => {
        const a = cinematicaInversa({ x: 120, y: 90 }, B, 1)!;
        expect(deg(a.t2)).toBeCloseTo(82.8, 1);
        expect(deg(a.t1)).toBeCloseTo(-4.5, 1);
    });
    test('100 punti casuali nella corona: inversa poi diretta (slide 19), entrambi i gomiti', () => {
        for (let i = 0; i < 100; i++) {
            const r = 10 + Math.random() * 180;
            const ang = Math.random() * 2 * Math.PI;
            const p = { x: r * Math.cos(ang), y: r * Math.sin(ang) };
            for (const gomito of [1, -1] as const) {
                const a = cinematicaInversa(p, B, gomito)!;
                expect(distanza(p, cinematicaDiretta(a, B))).toBeLessThan(0.001);
            }
        }
    });
    test('atan2: (3,4) e (-3,-4) danno orientamenti opposti', () => {
        const a = cinematicaInversa({ x: 3, y: 4 }, { L1: 5, L2: 5 }, 1)!;
        const b = cinematicaInversa({ x: -3, y: -4 }, { L1: 5, L2: 5 }, 1)!;
        expect(Math.abs(deg(a.t1) - deg(b.t1))).toBeGreaterThan(90);
    });
    test('punto fuori dallo spazio di lavoro -> null (niente NaN)', () => {
        expect(cinematicaInversa({ x: 250, y: 0 }, B, 1)).toBeNull();
        expect(cinematicaInversa({ x: NaN, y: 0 }, B, 1)).toBeNull();
    });
    test('sul bordo (distanza = L1 + L2) la tolleranza evita il NaN', () => {
        const a = cinematicaInversa({ x: 200 + 1e-10, y: 0 }, B, 1);
        expect(a).not.toBeNull();
        expect(Number.isFinite(a!.t2)).toBe(true);
    });
    test('t1 è sempre riportato in (-π, π]', () => {
        const a = cinematicaInversa({ x: -150, y: 10 }, B, -1)!;
        expect(a.t1).toBeGreaterThan(-Math.PI);
        expect(a.t1).toBeLessThanOrEqual(Math.PI);
        expect(deg(a.t1)).toBeCloseTo(-142.5, 0); // non 217.5
    });
    test('i due gomiti hanno t2 opposti', () => {
        const su = cinematicaInversa({ x: 120, y: 60 }, B, 1)!;
        const giu = cinematicaInversa({ x: 120, y: 60 }, B, -1)!;
        expect(su.t2).toBeCloseTo(-giu.t2);
    });
});

describe('stepDaPunta', () => {
    const limiti: Limiti[] = [{ min: 512, max: 3584 }, { min: 512, max: 3584 }];
    test('punto raggiungibile', () => {
        expect(stepDaPunta({ x: 150, y: 50 }, B, g1, g2, limiti, 1).ok).toBe(true);
    });
    test('punto irraggiungibile: errore leggibile', () => {
        const e = stepDaPunta({ x: 300, y: 0 }, B, g1, g2, limiti, 1);
        expect(e.ok).toBe(false);
        if (!e.ok) expect(e.errore).toMatch(/fuori dallo spazio di lavoro/);
    });
    test('limite superato: errore leggibile', () => {
        const e = stepDaPunta({ x: 150, y: 50 }, B, g1, g2, [{ min: 2000, max: 2100 }, limiti[1]], 1);
        expect(e.ok).toBe(false);
    });
});