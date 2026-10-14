import type { Bus } from './bus';
import {
    creaPacchettoPosizioneVelocita,
    creaPacchettoScrittura8,
    decodifica16,
} from './protocollo';

const REG_COPPIA = 0x28; // 40: torque enable (nel Lab 1 lo chiamavi "lock")
const REG_POS_ATTUALE = 0x38; // 56: posizione(2) velocità(2) carico(2) tensione(1) temperatura(1)

export interface Telemetria {
    posizione: number; // step 0..4095
    carico: number; // 0..1000 (modulo, come nel Lab 1)
    tensione: number; // V
    temperatura: number; // °C
}

export async function abilitaCoppia(bus: Bus, id: number, acceso: boolean): Promise<void> {
    await bus.richiedi(creaPacchettoScrittura8(id, REG_COPPIA, acceso ? 1 : 0), id);
}

// Scrive posizione obiettivo + velocità (registri 42-47) e aspetta la conferma del servo
export async function muoviServo(bus: Bus, id: number, posizione: number, velocita: number): Promise<void> {
    await bus.richiedi(creaPacchettoPosizioneVelocita(id, posizione, velocita, 0), id);
}

// Una sola lettura da 8 byte a partire dal registro 56
export async function leggiTelemetria(bus: Bus, id: number): Promise<Telemetria> {
    const b = await bus.leggi(id, REG_POS_ATTUALE, 8);
    if (b.length !== 8) throw new Error(`Servo ${id}: risposta di ${b.length} byte invece di 8`);
    return {
        posizione: decodifica16(b[0], b[1]),
        carico: decodifica16(b[4], b[5]) & 0x03ff,
        tensione: b[6] / 10,
        temperatura: b[7],
    };
}

export async function leggiPosizione(bus: Bus, id: number): Promise<number> {
    const b = await bus.leggi(id, REG_POS_ATTUALE, 2);
    return decodifica16(b[0], b[1]);
}