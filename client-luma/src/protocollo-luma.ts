/**
 * Crea un frame binario TXN (0x01) per l'ESP32.
 * Aggiunge l'header obbligatorio di 40 byte al pacchetto STS destinato ai motori.
 */
export function creaFrameTxn(seq: number, payloadSts: Uint8Array): Uint8Array {
  // Il frame totale è 40 byte di header + la lunghezza del pacchetto STS
  const buffer = new Uint8Array(40 + payloadSts.length);
  const view = new DataView(buffer.buffer);

  // Costruzione dell'header
  view.setUint8(0, 0x01);                       // type = 0x01 (TXN)
  view.setUint16(1, seq, true);                 // seq, little-endian (true)
  view.setUint8(3, 0);                          // light = 0
  
  // I byte 4-39 (ring) rimangono a 0 di default tramite l'inizializzazione di Uint8Array

  // Copia il pacchetto STS (es. il comando SYNC WRITE) partendo dall'indice 40
  buffer.set(payloadSts, 40);

  return buffer;
}

export interface StatoMotore {
  id: number;
  posizione: number;
  carico: number;
  temperatura: number;
  errore: number;
}

/**
 * Analizza il payload binario della TELEMETRIA (tipo 0x03).
 * Si aspetta di ricevere SOLO il payload (senza i 4 byte dell'header WebSocket).
 */
export function analizzaTelemetria(payload: Uint8Array): StatoMotore[] {
  const motori: StatoMotore[] = [];
  const dimBlocco = 37;

  // Ciclo su tutti i blocchi da 37 byte presenti nel payload
  for (let i = 0; i <= payload.length - dimBlocco; i += dimBlocco) {
    const blocco = payload.subarray(i, i + dimBlocco);

    // Verifica l'intestazione (FF FF), l'ID e la lunghezza fissa (0x21)
    if (blocco[0] !== 0xFF || blocco[1] !== 0xFF || blocco[3] !== 0x21) {
      continue; // Salta se il blocco è disallineato o corrotto
    }

    const id = blocco[2];
    const errore = blocco[4]; // Byte di errore di base

    // Verifica formale del Checksum
    let somma = 0;
    for (let j = 2; j <= 35; j++) {
      somma += blocco[j];
    }
    const checksumCalcolato = (~somma) & 0xFF;
    const checksumRicevuto = blocco[36];

    if (checksumCalcolato !== checksumRicevuto) {
      console.warn(`Checksum errato per l'ID ${id}. Dati scartati.`);
      continue;
    }

    // Estrazione dei dati usando DataView
    // I registri dal 40 al 70 si trovano mappati sui byte dal 5 al 35
    // Formula per calcolare l'indice: (NumeroRegistro - 40) + 5
    const view = new DataView(blocco.buffer, blocco.byteOffset, blocco.byteLength);

    // Posizione attuale (Reg 56-57): (56 - 40) + 5 = 21
    const posizione = view.getUint16(21, true); // true = little-endian

    // Carico attuale (Reg 60-61): (60 - 40) + 5 = 25
    const caricoGrezzo = view.getUint16(25, true);
    const carico = caricoGrezzo & 0x03FF; // Rimuove il bit di direzione per il valore assoluto

    // Temperatura attuale (Reg 63): (63 - 40) + 5 = 28
    const temperatura = view.getUint8(28);

    motori.push({ id, posizione, carico, temperatura, errore });
  }

  return motori;
}
