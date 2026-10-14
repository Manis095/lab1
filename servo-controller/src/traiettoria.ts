import type { Punto } from './cinematica';

export type Percorso = (s: number) => Punto;
export type LeggeOraria = (t: number) => number;

// ---------- percorsi ----------
export function puntoDelSegmento(s: number, A: Punto, B: Punto): Punto {
    return { x: A.x + (B.x - A.x) * s, y: A.y + (B.y - A.y) * s };
}

export function puntoDelCerchio(s: number, centro: Punto, raggio: number): Punto {
    const a = 2 * Math.PI * s;
    return { x: centro.x + raggio * Math.cos(a), y: centro.y + raggio * Math.sin(a) };
}

export const percorsoCerchio = (centro: Punto, raggio: number): Percorso =>
    (s) => puntoDelCerchio(s, centro, raggio);

// ---------- leggi orarie ----------
export const lineare: LeggeOraria = (t) => t;
export const raccordo: LeggeOraria = (t) => t * t * (3 - 2 * t); // velocità nulla agli estremi

// ---------- numeri da calcolare PRIMA di fissare i parametri ----------
export function sviluppoCerchio(raggio: number): number {
    return 2 * Math.PI * raggio; // mm
}

export function velocitaMedia(raggio: number, durataS: number): number {
    return sviluppoCerchio(raggio) / durataS; // mm/s
}

export function velocitaPicco(raggio: number, durataS: number, legge: 'lineare' | 'raccordo'): number {
    return velocitaMedia(raggio, durataS) * (legge === 'raccordo' ? 1.5 : 1); // mm/s
}

// Scostamento massimo fra corda e arco con N campioni: f = r (1 - cos(pi / N))
export function sagitta(raggio: number, campioni: number): number {
    return raggio * (1 - Math.cos(Math.PI / campioni)); // mm
}

// ---------- dove un giunto inverte il verso (slide 34) ----------
// step: valori di un giunto lungo il percorso, campionato in modo uniforme in s.
// Restituisce gli indici in cui il verso cambia: è lì che il gioco viene recuperato e il tracciato
// si deforma. Vicino all'inversione lo step resta fermo per qualche campione: prendo il centro.
// Con chiuso = true controlla anche il passaggio fine -> inizio (il cerchio riparte da dove arriva).
export function inversioni(step: number[], chiuso = false): number[] {
    const M = step.length - 1;
    const tratti: { i: number; v: number }[] = [];
    for (let i = 1; i <= M; i++) {
        const v = Math.sign(step[i] - step[i - 1]);
        if (v !== 0) tratti.push({ i: i - 1, v }); // i campioni fermi (stesso step) non contano
    }
    const risultato: number[] = [];
    for (let k = 1; k < tratti.length; k++) {
        if (tratti[k].v !== tratti[k - 1].v) risultato.push(Math.round((tratti[k - 1].i + 1 + tratti[k].i) / 2));
    }
    if (chiuso && tratti.length > 1) {
        const primo = tratti[0];
        const ultimo = tratti[tratti.length - 1];
        if (primo.v !== ultimo.v) risultato.unshift(Math.round((ultimo.i + 1 + primo.i + M) / 2) % M);
    }
    return risultato;
}

// ---------- controllo preventivo di tutto il percorso ----------
// Campiona il percorso e prova ogni punto: se uno fallisce, non si muove nulla.
export function controllaPercorso(
    percorso: Percorso,
    campioni: number,
    prova: (p: Punto) => { ok: boolean; errore?: string },
): { ok: true } | { ok: false; errore: string } {
    for (let i = 0; i <= campioni; i++) {
        const p = percorso(i / campioni);
        const esito = prova(p);
        if (!esito.ok) return { ok: false, errore: `s = ${(i / campioni).toFixed(2)}: ${esito.errore ?? 'punto non valido'}` };
    }
    return { ok: true };
}

// ---------- ciclo basato sull'OROLOGIO ----------
export interface OpzioniTraiettoria {
    percorso: Percorso;
    legge: LeggeOraria;
    durataMs: number;
    periodoMs: number;
    invia: (p: Punto, t: number, s: number) => Promise<void>; // manda il punto ai servo
    onFine: (errore?: Error) => void;
    ora?: () => number; // per i test
}

export function avviaTraiettoria(o: OpzioniTraiettoria): { ferma: () => void } {
    const ora = o.ora ?? (() => performance.now());
    const inizio = ora();
    let occupato = false;
    let fermata = false;
    let finita = false;

    const concludi = (errore?: Error) => {
        if (finita) return; // onFine deve scattare una sola volta
        finita = true;
        clearInterval(timer);
        o.onFine(errore);
    };

    const passo = async () => {
        if (fermata || occupato) return; // se il giro precedente non ha finito, salto: l'orologio recupera
        occupato = true;
        try {
            const t = Math.min(1, (ora() - inizio) / o.durataMs);
            const s = o.legge(t);
            await o.invia(o.percorso(s), t, s);
            if (t >= 1) concludi(); // l'ultimo campione ha s = 1 esatto: il cerchio si chiude
        } catch (e) {
            concludi(e instanceof Error ? e : new Error(String(e)));
        } finally {
            occupato = false;
        }
    };

    const timer = setInterval(passo, o.periodoMs);

    return {
        ferma: () => {
            if (fermata) return;
            fermata = true;
            concludi();
        },
    };
}