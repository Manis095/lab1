export const L1 = 173; // mm (primo braccio)
export const L2 = 170; // mm (secondo braccio)

export interface Posizione2D {
  x: number;
  y: number;
}

export interface SoluzioneInversa {
  t1: number; // angolo giunto 1 in radianti
  t2: number; // angolo giunto 2 in radianti
  raggiungibile: boolean;
}

/**
 * Cinematica Diretta: dagli angoli in radianti alle coordinate (x, y) della punta in mm.
 */
export function diretta(t1: number, t2: number): Posizione2D {
  const x = L1 * Math.cos(t1) + L2 * Math.cos(t1 + t2);
  const y = L1 * Math.sin(t1) + L2 * Math.sin(t1 + t2);
  return { x, y };
}

/**
 * Cinematica Inversa: dalle coordinate (x, y) agli angoli (t1, t2) in radianti.
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

  // Teorema del coseno
  let c2 = (r2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);

  // Protezione anti-NaN (saturazione [-1, 1])
  c2 = Math.max(-1, Math.min(1, c2));

  const t2 = gomito * Math.acos(c2);
  const beta = Math.atan2(y, x);
  const alfa = Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
  const t1 = beta - alfa;

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