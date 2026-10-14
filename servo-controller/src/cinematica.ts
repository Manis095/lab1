export interface Braccio { L1: number; L2: number }
export interface Punto { x: number; y: number }
export interface Angoli { t1: number; t2: number }
// Un giunto = un servo (id) + la sua calibrazione
export interface Giunto { id: number; offset: number; verso: 1 | -1 }

const STEP_GIRO = 4096;

// ---------- step <-> radianti ----------
export function stepInRadianti(step: number, g: Giunto): number {
    return g.verso * ((step - g.offset) / STEP_GIRO) * 2 * Math.PI;
}

export function radiantiInStep(rad: number, g: Giunto): number {
    return Math.round(g.offset + g.verso * (rad / (2 * Math.PI)) * STEP_GIRO);
}

// ---------- cinematica diretta: angoli -> punta ----------
export function cinematicaDiretta(a: Angoli, b: Braccio): Punto {
    return {
        x: b.L1 * Math.cos(a.t1) + b.L2 * Math.cos(a.t1 + a.t2),
        y: b.L1 * Math.sin(a.t1) + b.L2 * Math.sin(a.t1 + a.t2),
    };
}

export function distanza(p: Punto, q: Punto): number {
    return Math.hypot(p.x - q.x, p.y - q.y);
}

// Da step dei due servo alla posizione della punta (mm)
export function puntaDaStep(step1: number, step2: number, g1: Giunto, g2: Giunto, b: Braccio): Punto {
    return cinematicaDiretta({ t1: stepInRadianti(step1, g1), t2: stepInRadianti(step2, g2) }, b);
}

// ---------- cinematica inversa: punta -> angoli ----------
const TOLLERANZA = 1e-9;

// gomito = +1 (gomito basso, θ2 > 0) oppure -1 (gomito alto, θ2 < 0). null se irraggiungibile.
export function cinematicaInversa(p: Punto, b: Braccio, gomito: 1 | -1): Angoli | null {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;

    const r2 = p.x * p.x + p.y * p.y; // distanza al quadrato
    let c2 = (r2 - b.L1 * b.L1 - b.L2 * b.L2) / (2 * b.L1 * b.L2);

    // Fuori dallo spazio di lavoro: l'arcocoseno darebbe NaN
    if (c2 > 1 + TOLLERANZA || c2 < -1 - TOLLERANZA) return null;
    // Sul bordo la virgola mobile può dare 1.0000000002: saturiamo in [-1, 1]
    c2 = Math.max(-1, Math.min(1, c2));

    const t2 = gomito * Math.acos(c2);
    const t1grezzo = Math.atan2(p.y, p.x) - Math.atan2(b.L2 * Math.sin(t2), b.L1 + b.L2 * Math.cos(t2));
    // La differenza di due atan2 può uscire da (-π, π] (es. 217° invece di -143°): la riporto dentro,
    // altrimenti con limiti larghi un punto raggiungibile risulterebbe "fuori limite"
    const t1 = Math.atan2(Math.sin(t1grezzo), Math.cos(t1grezzo));

    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
    return { t1, t2 };
}

// Il punto sta nella corona circolare |L1-L2| <= r <= L1+L2 ?
export function raggiungibile(p: Punto, b: Braccio): boolean {
    return cinematicaInversa(p, b, 1) !== null;
}

export interface Limiti { min: number; max: number }

// Dal punto (x, y) agli step dei due servo, controllando raggiungibilità e limiti.
// Restituisce gli step oppure un messaggio di errore leggibile.
export type EsitoStep =
    | { ok: true; step1: number; step2: number }
    | { ok: false; errore: string };

export function stepDaPunta(
    p: Punto, b: Braccio, g1: Giunto, g2: Giunto, limiti: Limiti[], gomito: 1 | -1,
): EsitoStep {
    const a = cinematicaInversa(p, b, gomito);
    if (!a) return { ok: false, errore: `Punto (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) fuori dallo spazio di lavoro` };

    const step1 = radiantiInStep(a.t1, g1);
    const step2 = radiantiInStep(a.t2, g2);
    if (!Number.isFinite(step1) || !Number.isFinite(step2)) return { ok: false, errore: 'Calcolo non valido (NaN)' };

    if (step1 < limiti[0].min || step1 > limiti[0].max)
        return { ok: false, errore: `Punto (${p.x.toFixed(1)}, ${p.y.toFixed(1)}): servo ${g1.id} fuori limite (${step1} step)` };
    if (step2 < limiti[1].min || step2 > limiti[1].max)
        return { ok: false, errore: `Punto (${p.x.toFixed(1)}, ${p.y.toFixed(1)}): servo ${g2.id} fuori limite (${step2} step)` };

    return { ok: true, step1, step2 };
}