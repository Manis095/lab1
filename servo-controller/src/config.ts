import type { Braccio, Giunto } from './cinematica';

export const BRACCIO: Braccio = { L1: 100, L2: 100 }; // mm, da perno a perno

// offset = step letti ad angolo zero (braccio allineato all'asse x)
// verso  = +1, oppure -1 se girando in senso antiorario gli step DIMINUISCONO
export const GIUNTO_1: Giunto = { id: 1, offset: 2048, verso: 1 };
export const GIUNTO_2: Giunto = { id: 2, offset: 2048, verso: 1 };

// Limiti meccanici in step (finecorsa, filo, base). Sostituiscili con quelli veri.
export const LIMITI = [
    { min: 512, max: 3584 },
    { min: 512, max: 3584 },
];

// +1 = gomito basso (θ2 > 0), -1 = gomito alto (θ2 < 0), come nella slide 7.
// Scelto una volta sola e documentato (slide 14-16).
export const GOMITO: 1 | -1 = 1;

export const VELOCITA_SERVO = 2000; // step/s mandati al servo come limite di velocità
export const PERIODO_MS = 20; // un campione ogni 20 ms = 50 al secondo
export const LETTURA_OGNI = 1; // durante la traiettoria rileggo i servo un campione ogni N (2-3 se il bus è carico)