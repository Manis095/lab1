// Parametri del collegamento seriale: unico punto in cui cambiarli.

/** UART 8N1 a 1 Mbaud: un carattere = 10 bit = 10 µs. */
export const BAUD_RATE = 1_000_000

/**
 * Attesa massima di una risposta. 50 ms è una stima prudente: la trasmissione
 * di un pacchetto richiede meno di 0,2 ms, ma contano anche il ritardo di
 * risposta configurato nel servo (registro 7, che NON tocchiamo) e la latenza
 * dell'adattatore USB (alcuni chip bufferizzano fino a 16 ms).
 * Se compaiono molti timeout con alimentazione e cavi a posto, alzarlo qui.
 */
export const DEFAULT_TIMEOUT_MS = 50

/** Timeout consecutivi oltre i quali si segnala un probabile guasto. */
export const TIMEOUT_ALARM_THRESHOLD = 5

/** ID del servo di laboratorio. */
export const SERVO_ID = 1
