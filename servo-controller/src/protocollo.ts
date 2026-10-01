// Funzione per il calcolo del checksum (somma modulo 256, poi complemento a uno con FF)
export function calcolaChecksum(bytes: number[]): number{
    const sum = bytes.reduce((acc, byte) => acc + byte, 0);
    return (~sum) & 0xFF;
}

// Converte un array di byte o un Uint8Array in una stringa esadecimale leggibile (es. "FF FF 01 02 01 FB")
export function toHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}


// Qui assembliamo il pacchetto di dati da inviare al bus
export function creaPacchetto(id: number, istruzione: number, parametri: number[] = []): Uint8Array {
    const lunghezza = 1 + parametri.length + 1;
    const byteProtetti = [id, lunghezza, istruzione, ...parametri];
    const checksum = calcolaChecksum(byteProtetti);
    return new Uint8Array([0xFF, 0xFF, ...byteProtetti, checksum]);
}

/**
 * Crea un pacchetto per scrivere un valore a 16 bit in formato Little-Endian.
 * @param id Identificativo del servo (es. 1)
 * @param registro Indirizzo del registro di partenza (es. 0x2A / 42 per la posizione)
 * @param valore Numero a 16 bit (0 - 4095)
 */
export function creaPacchettoScrittura16(id: number, registro: number, valore: number): Uint8Array {
  const byteBasso = valore & 0xFF;
  const byteAlto = (valore >> 8) & 0xFF;

  // Istruzione di scrittura = 0x03
  return creaPacchetto(id, 0x03, [registro, byteBasso, byteAlto]);
}

/**
 * Crea un pacchetto per richiedere la lettura di uno o più registri.
 * @param id Identificativo del servo
 * @param registro Indirizzo del primo registro da leggere (es. 0x38 / 56 per la posizione attuale)
 * @param numByte Quanti byte leggere consecutivi (es. 2 per un valore a 16 bit)
 */
export function creaPacchettoLettura(id: number, registro: number, numByte: number): Uint8Array {
  // Istruzione di lettura = 0x02
  return creaPacchetto(id, 0x02, [registro, numByte]);
}

export interface RispostaServo {
  id: number;
  stato: number;
  dati: number[];
  byteGrezzi: number[];
}

export class ParserSTS {
  private buffer: number[] = [];

  public alimenta(nuoviByte: Uint8Array): RispostaServo[] {
    // Aggiungiamo i byte appena arrivati in fondo al buffer accumulatore
    for (let i = 0; i < nuoviByte.length; i++) {
      this.buffer.push(nuoviByte[i]);
    }

    const pacchettiTrovati: RispostaServo[] = [];

    while (this.buffer.length >= 4) {
      // Se i primi due byte non sono FF FF, scartiamo il primo byte e riproviamo
      if (this.buffer[0] !== 0xFF || this.buffer[1] !== 0xFF) {
        this.buffer.shift();
        continue;
      }

      const id = this.buffer[2];
      const len = this.buffer[3];
      const lunghezzaTotale = 4 + len;

      // Se non abbiamo ancora ricevuto tutti i byte previsti per questo pacchetto, aspettiamo altri dati
      if (this.buffer.length < lunghezzaTotale) {
        break;
      }

      // Estraiamo il pacchetto candidato dal buffer
      const pacchettoGrezzo = this.buffer.slice(0, lunghezzaTotale);

      // Verifichiamo il checksum: i byte protetti vanno dall'indice 2 (ID) fino all'ultimo escluso (il CHK)
      const byteProtetti = pacchettoGrezzo.slice(2, lunghezzaTotale - 1);
      const chkRicevuto = pacchettoGrezzo[lunghezzaTotale - 1];
      const chkCalcolato = calcolaChecksum(byteProtetti);

      if (chkCalcolato === chkRicevuto) {
        // Pacchetto valido: rimuoviamo i byte dal buffer
        this.buffer.splice(0, lunghezzaTotale);

        // Nelle risposte STS: pacchettoGrezzo[4] è il byte di stato
        // Da pacchettoGrezzo[5] fino all'indice prima del checksum ci sono i dati
        const stato = pacchettoGrezzo[4];
        const dati = pacchettoGrezzo.slice(5, lunghezzaTotale - 1);

        pacchettiTrovati.push({ id, stato, dati, byteGrezzi: Array.from(pacchettoGrezzo) });
      } else {
        // Checksum non corrispondente: potrebbe essere un falso allineamento su un FF FF casuale.
        // Avanziamo di un byte per riallinearci (come indicato nella slide 33)
        this.buffer.shift();
      }
    }

    return pacchettiTrovati;
  }

  /**
   * Svuota il buffer interno (utile in caso di reset o riconnessione).
   */
  public reset(): void {
    this.buffer = [];
  }
}

// Converte due byte (Little-Endian: basso, alto) in un intero a 16 bit (0 - 65535).
export function decodifica16(byteBasso: number, byteAlto: number): number {
  return byteBasso | (byteAlto << 8);
}

// Converte il valore del registro (0-4095) in gradi (0.0° - 360.0°).
export function stepInGradi(step: number): number {
  return Number(((step * 360) / 4096).toFixed(1));
}

//Converte gradi (0° - 360°) nel valore di registro a 12 bit (0-4095).
export function gradiInStep(gradi: number): number {
  return Math.round((gradi * 4096) / 360);
}

/**
 * Crea un pacchetto per scrivere posizione, tempo e velocità in un'unica operazione (registri 42-47).
 * @param id Identificativo del servo
 * @param posizione Step obiettivo (0 - 4095)
 * @param velocita Velocità in step/secondo (es. 100 - 3000)
 * @param tempo Tempo di percorrenza in ms (default 0 = usa solo la velocità)
 */
export function creaPacchettoPosizioneVelocita(
  id: number,
  posizione: number,
  velocita: number,
  tempo: number = 0
): Uint8Array {
  const pBasso = posizione & 0xFF;
  const pAlto = (posizione >> 8) & 0xFF;

  const tBasso = tempo & 0xFF;
  const tAlto = (tempo >> 8) & 0xFF;

  const vBasso = velocita & 0xFF;
  const vAlto = (velocita >> 8) & 0xFF;

  // Istruzione 0x03 (scrittura), registro di partenza 0x2A (42), seguito dai 6 byte
  return creaPacchetto(id, 0x03, [0x2A, pBasso, pAlto, tBasso, tAlto, vBasso, vAlto]);
}