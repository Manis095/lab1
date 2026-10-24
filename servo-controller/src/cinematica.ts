export const L1 = 173; // mm
export const L2 = 170; // mm

export interface Posizione2D {
  x: number;
  y: number;
}

export interface SoluzioneInversa {
  t1: number; // angolo giunto 1 in radianti
  t2: number; // angolo giunto 2 in radianti
  raggiungibile: boolean;
}

// Cinematica Diretta: dagli angoli in radianti alle coordinate (x, y) della punta in mm.
export function diretta(t1: number, t2: number): Posizione2D {
  const x = L1 * Math.cos(t1) + L2 * Math.cos(t1 + t2);
  const y = L1 * Math.sin(t1) + L2 * Math.sin(t1 + t2);
  return { x, y };
}

/**
 * Cinematica Inversa: dalle coordinate (x, y) agli angoli (t1, t2) in radianti.
 * @param x Coordinate target x (mm)
 * @param y Coordinate target y (mm)
 * @param gomito +1 per gomito basso, -1 per gomito alto
 */
export function inversa(x: number, y: number, gomito: number = 1): SoluzioneInversa {
  const r2 = x * x + y * y;
  const rMax = L1 + L2;
  const rMin = Math.abs(L1 - L2);
  const r = Math.sqrt(r2);

  let raggiungibile = true;
  if (r > rMax || r < rMin) {
    raggiungibile = false;
  }

  // Calcolo del coseno del secondo giunto (Teorema di Carnot / Coseno)
  let c2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);

  // Protezione anti-NaN: saturazione nell'intervallo [-1, 1]
  c2 = Math.max(-1, Math.min(1, c2));

  // Angolo del secondo giunto (relativo al primo braccio)
  const t2 = gomito * Math.acos(c2);

  // Angolo del primo giunto (direzione obiettivo - orientamento braccio)
  const beta = Math.atan2(y, x);
  const alfa = Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
  const t1 = beta - alfa;

  // Verifica di sicurezza contro propagazione NaN
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) {
    return { t1: 0, t2: 0, raggiungibile: false };
  }

  return { t1, t2, raggiungibile };
}

/**
 * Conversione da radianti a gradi
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Conversione da radianti a passi encoder (0-4095) con offset
 */
export function radToStep(rad: number, offsetStep: number = 2048): number {
  return Math.round(offsetStep + (rad / (2 * Math.PI)) * 4096);
}