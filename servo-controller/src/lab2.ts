import { bus, seriale, scriviLog } from './contesto';
import { creaPacchetto, creaPacchettoScrittura8 } from './protocollo';
import { BRACCIO, GIUNTO_1, GIUNTO_2, GOMITO, LETTURA_OGNI, LIMITI, PERIODO_MS, VELOCITA_SERVO } from './config';
import { distanza, puntaDaStep, stepDaPunta, type Punto } from './cinematica';
import { abilitaCoppia, leggiTelemetria, muoviServo, type Telemetria } from './servo';
import {
    type Percorso,
    avviaTraiettoria, controllaPercorso, inversioni, lineare, percorsoCerchio, raccordo,
    sagitta, sviluppoCerchio, velocitaMedia, velocitaPicco,
} from './traiettoria';

// ---------- elementi della pagina ----------
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const btnInit = $<HTMLButtonElement>('btn-l2-init');
const btnZero = $<HTMLButtonElement>('btn-l2-zero');
const selVerso1 = $<HTMLSelectElement>('sel-verso-1');
const selVerso2 = $<HTMLSelectElement>('sel-verso-2');
const chkLettura = $<HTMLInputElement>('chk-l2-lettura');
const labelStato = $<HTMLDivElement>('label-l2-stato');
const inX = $<HTMLInputElement>('in-x');
const inY = $<HTMLInputElement>('in-y');
const btnVai = $<HTMLButtonElement>('btn-l2-vai');
const inCx = $<HTMLInputElement>('in-cx');
const inCy = $<HTMLInputElement>('in-cy');
const inR = $<HTMLInputElement>('in-r');
const inDurata = $<HTMLInputElement>('in-durata');
const selLegge = $<HTMLSelectElement>('sel-legge');
const btnCerchio = $<HTMLButtonElement>('btn-l2-cerchio');
const btnFerma = $<HTMLButtonElement>('btn-l2-ferma');
const btnCsv = $<HTMLButtonElement>('btn-l2-csv');
const labelInfo = $<HTMLDivElement>('label-l2-info');

const btnCerca = $<HTMLButtonElement>('btn-l2-cerca');
const inIdVecchio = $<HTMLInputElement>('in-id-vecchio');
const inIdNuovo = $<HTMLInputElement>('in-id-nuovo');
const btnCambiaId = $<HTMLButtonElement>('btn-l2-cambia-id');

// ---------- stato del Lab 2 ----------
// Copie modificabili della configurazione: offset e verso si possono cambiare dalla pagina
const g1 = { ...GIUNTO_1 };
const g2 = { ...GIUNTO_2 };
selVerso1.value = String(g1.verso);
selVerso2.value = String(g2.verso);

let timerLettura: number | null = null;
let occupatoLettura = false;
let inCorso = false; // c'è un movimento in corso?
let traiettoria: { ferma: () => void } | null = null;

interface Campione {
    tMs: number; t: number; s: number;
    xCmd: number; yCmd: number; step1Cmd: number; step2Cmd: number;
    step1Letto: number; step2Letto: number; xLetto: number; yLetto: number;
}
let campioni: Campione[] = [];

const attesa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const num = (el: HTMLInputElement) => Number(el.value);
const mm = (v: number) => v.toFixed(2);

// ---------- lettura dei due servo ----------
async function leggiDue(): Promise<[Telemetria, Telemetria]> {
    const t1 = await leggiTelemetria(bus, g1.id);
    const t2 = await leggiTelemetria(bus, g2.id);
    return [t1, t2];
}

function mostraStato(t1: Telemetria, t2: Telemetria) {
    const p = puntaDaStep(t1.posizione, t2.posizione, g1, g2, BRACCIO);
    labelStato.textContent =
        `Servo ${g1.id}: ${t1.posizione} step, carico ${t1.carico}, ${t1.temperatura} °C | ` +
        `Servo ${g2.id}: ${t2.posizione} step, carico ${t2.carico}, ${t2.temperatura} °C -> ` +
        `punta x = ${mm(p.x)} mm, y = ${mm(p.y)} mm`;
}

chkLettura.addEventListener('change', () => {
    if (chkLettura.checked) {
        timerLettura = window.setInterval(async () => {
            if (occupatoLettura || inCorso) return; // non disturbo i movimenti
            occupatoLettura = true;
            try {
                const [t1, t2] = await leggiDue();
                mostraStato(t1, t2);
            } catch (e: any) {
                scriviLog(`Errore lettura: ${e.message}`);
            }
            occupatoLettura = false;
        }, 200);
    } else if (timerLettura !== null) {
        clearInterval(timerLettura);
        timerLettura = null;
    }
});

// ---------- inizializzazione: ping e coppia su entrambi ----------
btnInit.addEventListener('click', async () => {
    try {
        for (const g of [g1, g2]) {
            const ok = await bus.ping(g.id);
            if (!ok) throw new Error(`il servo ${g.id} non risponde al ping`);
            await abilitaCoppia(bus, g.id, true);
            scriviLog(`Servo ${g.id}: ping ok, coppia attiva`);
        }
        const [t1, t2] = await leggiDue();
        mostraStato(t1, t2);
    } catch (e: any) {
        scriviLog(`Errore inizializzazione: ${e.message}`);
    }
});

// ---------- calibrazione ----------
btnZero.addEventListener('click', async () => {
    try {
        const [t1, t2] = await leggiDue();
        g1.offset = t1.posizione;
        g2.offset = t2.posizione;
        scriviLog(`Zero impostato. Scrivi in config.ts: offset servo ${g1.id} = ${g1.offset}, servo ${g2.id} = ${g2.offset}`);
        mostraStato(t1, t2);
    } catch (e: any) {
        scriviLog(`Errore: ${e.message}`);
    }
});

selVerso1.addEventListener('change', () => { g1.verso = Number(selVerso1.value) as 1 | -1; });
selVerso2.addEventListener('change', () => { g2.verso = Number(selVerso2.value) as 1 | -1; });

// ---------- movimento verso un punto, con attesa dell'arrivo ----------
async function attendiArrivo(obiettivo1: number, obiettivo2: number, tolleranza = 4, timeoutMs = 4000) {
    const inizio = performance.now();
    let [t1, t2] = await leggiDue();
    while (performance.now() - inizio < timeoutMs) {
        if (Math.abs(t1.posizione - obiettivo1) <= tolleranza && Math.abs(t2.posizione - obiettivo2) <= tolleranza) break;
        await attesa(100);
        [t1, t2] = await leggiDue();
    }
    return [t1, t2] as [Telemetria, Telemetria];
}

function provaPunto(p: Punto) {
    const e = stepDaPunta(p, BRACCIO, g1, g2, LIMITI, GOMITO);
    return e.ok ? { ok: true } : { ok: false, errore: e.errore };
}

// ---------- analisi del percorso in step, prima di muovere ----------
// Campiona il percorso in M punti e restituisce gli step dei due giunti (il percorso è già controllato)
function stepLungoPercorso(percorso: Percorso, M: number): { s1: number[]; s2: number[] } {
    const s1: number[] = [];
    const s2: number[] = [];
    for (let i = 0; i <= M; i++) {
        const e = stepDaPunta(percorso(i / M), BRACCIO, g1, g2, LIMITI, GOMITO);
        if (!e.ok) throw new Error(e.errore);
        s1.push(e.step1);
        s2.push(e.step2);
    }
    return { s1, s2 };
}

// Slide 31: la velocità di picco richiesta ai GIUNTI (step/s), da confrontare con VELOCITA_SERVO.
// Δstep massimo fra due punti vicini, diviso per il tempo medio fra i due, per il fattore della legge.
function piccoGiunti(s1: number[], s2: number[], durataS: number, fattoreLegge: number): number {
    const M = s1.length - 1;
    let max = 0;
    for (let i = 1; i <= M; i++) {
        max = Math.max(max, Math.abs(s1[i] - s1[i - 1]), Math.abs(s2[i] - s2[i - 1]));
    }
    return ((max * M) / durataS) * fattoreLegge;
}

// ---------- OBIETTIVO MINIMO: raggiungere un punto e documentare l'errore ----------
btnVai.addEventListener('click', async () => {
    if (inCorso) return;
    const obiettivo: Punto = { x: num(inX), y: num(inY) };
    const e = stepDaPunta(obiettivo, BRACCIO, g1, g2, LIMITI, GOMITO);
    if (!e.ok) { scriviLog(`Non muovo: ${e.errore}`); return; }

    inCorso = true;
    try {
        scriviLog(`Obiettivo (${mm(obiettivo.x)}, ${mm(obiettivo.y)}) mm -> step ${g1.id}: ${e.step1}, step ${g2.id}: ${e.step2}`);
        await muoviServo(bus, g1.id, e.step1, VELOCITA_SERVO / 2);
        await muoviServo(bus, g2.id, e.step2, VELOCITA_SERVO / 2);
        const [t1, t2] = await attendiArrivo(e.step1, e.step2);
        mostraStato(t1, t2);
        const raggiunto = puntaDaStep(t1.posizione, t2.posizione, g1, g2, BRACCIO);
        scriviLog(
            `Raggiunto (${mm(raggiunto.x)}, ${mm(raggiunto.y)}) mm. ` +
            `Errore: dx = ${mm(raggiunto.x - obiettivo.x)}, dy = ${mm(raggiunto.y - obiettivo.y)}, ` +
            `|e| = ${mm(distanza(raggiunto, obiettivo))} mm (step letti ${t1.posizione}, ${t2.posizione})`,
        );
    } catch (err: any) {
        scriviLog(`Errore: ${err.message}`);
    }
    inCorso = false;
});

// ---------- OBIETTIVO COMPLETO: circonferenza e errore di chiusura ----------
btnCerchio.addEventListener('click', async () => {
    if (inCorso) return;
    const centro: Punto = { x: num(inCx), y: num(inCy) };
    const raggio = num(inR);
    const durataS = num(inDurata);
    const nomeLegge = selLegge.value as 'lineare' | 'raccordo';
    if (!(raggio > 0) || !(durataS > 0)) { scriviLog('Raggio e durata devono essere positivi'); return; }
    const percorso = percorsoCerchio(centro, raggio);

    // 1) i numeri da conoscere prima di muovere (slide 26-32)
    const N = Math.round((durataS * 1000) / PERIODO_MS);
    labelInfo.textContent =
        `sviluppo ${mm(sviluppoCerchio(raggio))} mm, velocità media ${mm(velocitaMedia(raggio, durataS))} mm/s, ` +
        `picco ${mm(velocitaPicco(raggio, durataS, nomeLegge))} mm/s, ${N} campioni, sagitta ${(sagitta(raggio, N) * 1000).toFixed(0)} µm`;

    // 2) controllo preventivo di tutto il percorso: se un punto non va, non si muove nulla
    const controllo = controllaPercorso(percorso, 200, provaPunto);
    if (!controllo.ok) { scriviLog(`Non muovo: ${controllo.errore}`); return; }

    // 3) velocità dei giunti (slide 31) e punti in cui cercare il gioco (slide 34)
    const { s1, s2 } = stepLungoPercorso(percorso, 360); // un punto per grado di circonferenza
    const picco = piccoGiunti(s1, s2, durataS, nomeLegge === 'raccordo' ? 1.5 : 1);
    if (picco > VELOCITA_SERVO) {
        scriviLog(`Non muovo: servono ${picco.toFixed(0)} step/s ai giunti, limite ${VELOCITA_SERVO}. Allunga la durata.`);
        return;
    }
    const gradi = (indici: number[]) => indici.map((i) => `${i}°`).join(', ') || 'nessuna';
    scriviLog(
        `Picco ai giunti ${picco.toFixed(0)} step/s (limite ${VELOCITA_SERVO}). ` +
        `Inversioni, in gradi sul cerchio da +x in senso antiorario: ` +
        `servo ${g1.id}: ${gradi(inversioni(s1, true))}; servo ${g2.id}: ${gradi(inversioni(s2, true))}`,
    );

    inCorso = true;
    campioni = [];
    try {
        // 4) vado al punto di partenza e aspetto
        const partenza = stepDaPunta(percorso(0), BRACCIO, g1, g2, LIMITI, GOMITO);
        if (!partenza.ok) throw new Error(partenza.errore);
        scriviLog('Vado al punto di partenza...');
        await muoviServo(bus, g1.id, partenza.step1, VELOCITA_SERVO / 2);
        await muoviServo(bus, g2.id, partenza.step2, VELOCITA_SERVO / 2);
        const [p1, p2] = await attendiArrivo(partenza.step1, partenza.step2);
        const inizioLetto = puntaDaStep(p1.posizione, p2.posizione, g1, g2, BRACCIO);
        scriviLog(`Partenza letta: (${mm(inizioLetto.x)}, ${mm(inizioLetto.y)}) mm. Parto: ${durataS} s, legge ${nomeLegge}.`);

        // 5) traiettoria basata sull'orologio
        const t0 = performance.now();
        let nInvio = 0;
        traiettoria = avviaTraiettoria({
            percorso,
            legge: nomeLegge === 'raccordo' ? raccordo : lineare,
            durataMs: durataS * 1000,
            periodoMs: PERIODO_MS,
            invia: async (p, t, s) => {
                const e = stepDaPunta(p, BRACCIO, g1, g2, LIMITI, GOMITO);
                if (!e.ok) throw new Error(e.errore); // ultima difesa: niente NaN verso i servo
                await muoviServo(bus, g1.id, e.step1, VELOCITA_SERVO);
                await muoviServo(bus, g2.id, e.step2, VELOCITA_SERVO);
                // registro anche cosa leggono i servo (per il CSV e per misurare il gioco)
                let l1 = NaN, l2 = NaN;
                if (nInvio++ % LETTURA_OGNI === 0) {
                    try {
                        const [t1, t2] = await leggiDue();
                        l1 = t1.posizione; l2 = t2.posizione;
                    } catch { /* una lettura persa: lascio NaN nel CSV */ }
                }
                const letto = Number.isFinite(l1) && Number.isFinite(l2)
                    ? puntaDaStep(l1, l2, g1, g2, BRACCIO) : { x: NaN, y: NaN };
                campioni.push({
                    tMs: performance.now() - t0, t, s, xCmd: p.x, yCmd: p.y,
                    step1Cmd: e.step1, step2Cmd: e.step2, step1Letto: l1, step2Letto: l2, xLetto: letto.x, yLetto: letto.y,
                });
            },
            onFine: async (errore) => {
                traiettoria = null;
                if (errore) scriviLog(`Traiettoria interrotta: ${errore.message}`);
                try {
                    await attesa(800); // lascio assestare i servo
                    const [t1, t2] = await leggiDue();
                    mostraStato(t1, t2);
                    const fineLetta = puntaDaStep(t1.posizione, t2.posizione, g1, g2, BRACCIO);
                    scriviLog(
                        `Fine. ${campioni.length} campioni eseguiti su ${N} previsti. ` +
                        `Errore di chiusura (letto): ${mm(distanza(inizioLetto, fineLetta))} mm ` +
                        `[partenza (${mm(inizioLetto.x)}, ${mm(inizioLetto.y)}) -> arrivo (${mm(fineLetta.x)}, ${mm(fineLetta.y)})]`,
                    );
                } catch (e: any) {
                    scriviLog(`Errore: ${e.message}`);
                }
                inCorso = false;
            },
        });
    } catch (err: any) {
        scriviLog(`Errore: ${err.message}`);
        inCorso = false;
    }
});

btnFerma.addEventListener('click', () => {
    if (traiettoria) {
        traiettoria.ferma();
        scriviLog('Traiettoria fermata dall\'utente');
    }
});

// ---------- esportazione CSV dei campioni ----------
btnCsv.addEventListener('click', () => {
    if (campioni.length === 0) { scriviLog('Nessun campione registrato'); return; }
    const righe = ['t_ms,t,s,x_cmd,y_cmd,step1_cmd,step2_cmd,step1_letto,step2_letto,x_letto,y_letto'];
    for (const c of campioni) {
        righe.push([c.tMs.toFixed(1), c.t.toFixed(4), c.s.toFixed(4), c.xCmd.toFixed(3), c.yCmd.toFixed(3),
        c.step1Cmd, c.step2Cmd, c.step1Letto, c.step2Letto, c.xLetto.toFixed(3), c.yLetto.toFixed(3)].join(','));
    }
    const blob = new Blob([righe.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'traiettoria.csv';
    a.click();
    URL.revokeObjectURL(a.href);
});

// ---------- diagnostica: chi c'è sul bus? ----------
btnCerca.addEventListener('click', async () => {
    if (inCorso) return;
    inCorso = true;
    scriviLog('Cerco i servo con ID da 0 a 253 (circa 8 s)...');
    const trovati: number[] = [];
    for (let id = 0; id <= 253; id++) {
        try {
            await bus.richiedi(creaPacchetto(id, 0x01), id, 30);
            trovati.push(id);
        } catch { /* nessuno con questo ID */ }
    }
    scriviLog(trovati.length > 0
        ? `Servo trovati: ID ${trovati.join(', ')}`
        : 'Nessun servo risponde: controlla alimentazione, cavo e collegamento');
    inCorso = false;
});

// ---------- cambio ID (registro 5 in EEPROM): UN SOLO SERVO COLLEGATO ----------
const REG_ID = 0x05;
const REG_BLOCCO_EEPROM = 0x37; // 55: 0 = EEPROM scrivibile, 1 = protetta

btnCambiaId.addEventListener('click', async () => {
    if (inCorso) return;
    const vecchio = num(inIdVecchio);
    const nuovo = num(inIdNuovo);
    const valido = (v: number) => Number.isInteger(v) && v >= 0 && v <= 253;
    if (!valido(vecchio) || !valido(nuovo) || vecchio === nuovo) { scriviLog('ID non validi'); return; }
    inCorso = true;
    try {
        if (await bus.ping(nuovo)) throw new Error(`l'ID ${nuovo} è già usato da un servo collegato`);
        // Invio diretto, senza aspettare la risposta: durante il cambio il servo
        // potrebbe rispondere con il vecchio ID o con il nuovo
        await seriale.invia(creaPacchettoScrittura8(vecchio, REG_BLOCCO_EEPROM, 0));
        await attesa(50);
        await seriale.invia(creaPacchettoScrittura8(vecchio, REG_ID, nuovo));
        await attesa(50);
        await seriale.invia(creaPacchettoScrittura8(nuovo, REG_BLOCCO_EEPROM, 1));
        await attesa(50);
        scriviLog(await bus.ping(nuovo)
            ? `Fatto: il servo ora ha ID ${nuovo}`
            : `Il servo non risponde con l'ID ${nuovo}: premi "Cerca servo sul bus"`);
    } catch (e: any) {
        scriviLog(`Errore cambio ID: ${e.message}`);
    }
    inCorso = false;
});