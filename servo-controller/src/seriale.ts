import { ParserSTS, type RispostaServo } from './protocollo';

export class GestoreSeriale {
  private porta: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private inLettura = false;
  private parser = new ParserSTS();

  // Callback richiamata ogni volta che il parser riconosce un pacchetto valido
  public onPacchettoRicevuto: ((pacchetto: RispostaServo) => void) | null = null;

  // Chiede all'utente di selezionare la porta e la apre a 1 Mbit/s
  public async connetti(): Promise<void> {
    if (!('serial' in navigator)) {
      throw new Error("Web Serial API non supportata in questo browser. Usa Chrome o Edge.");
    }

    this.porta = await navigator.serial.requestPort();

    await this.porta.open({ baudRate: 1000000 });
    this.parser.reset();

    this.avviaLoopLettura();
  }

  // Ciclo infinito che legge i byte grezzi e li invia al parser
  private async avviaLoopLettura(): Promise<void> {
    if (!this.porta || !this.porta.readable) return;

    this.inLettura = true;
    this.reader = this.porta.readable.getReader();

    try {
      while (this.inLettura) {
        const { value, done } = await this.reader.read();
        if (done) {
          // Stream interrotto o chiuso
          break;
        }
        if (value) {
          // Alimentiamo il parser con il frammento ricevuto
          const pacchetti = this.parser.alimenta(value);
          for (const pacchetto of pacchetti) {
            if (this.onPacchettoRicevuto) {
              this.onPacchettoRicevuto(pacchetto);
            }
          }
        }
      }
    } catch (err) {
      // Ignoriamo l'errore se causato dall'interruzione volontaria durante la disconnessione
      if (this.inLettura) {
        console.error("Errore durante la lettura seriale:", err);
      }
    } finally {
      // Rilasciamo il lock per permettere successive riaperture
      this.reader.releaseLock();
      this.reader = null;
    }
  }

  // Invia un pacchetto Uint8Array al bus
  public async invia(pacchetto: Uint8Array): Promise<void> {
    if (!this.porta || !this.porta.writable) {
      throw new Error("Porta non connessa o non pronta per la scrittura.");
    }

    const writer = this.porta.writable.getWriter();
    try {
      await writer.write(pacchetto);
    } finally {
      // Rilascia immediatamente il lock di scrittura
      writer.releaseLock();
    }
  }

  // Sequenza completa di rilascio risorse e chiusura (slide 34)
  public async disconnetti(): Promise<void> {
    this.inLettura = false;

    // Interrompiamo la lettura per sbloccare il loop del reader
    if (this.reader) {
      await this.reader.cancel();
      // Il lock verrà rilasciato nel blocco 'finally' di avviaLoopLettura
    }

    // Chiudiamo la porta fisica
    if (this.porta) {
      await this.porta.close();
      this.porta = null;
    }

    this.parser.reset();
  }

  public isConnesso(): boolean {
    return this.porta !== null;
  }
}