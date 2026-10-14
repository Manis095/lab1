import { creaPacchetto, creaPacchettoLettura, type RispostaServo } from './protocollo';

// Il Bus ha bisogno solo di queste due cose dal "canale" (GestoreSeriale nell'app, un finto nei test)
export interface Canale {
    invia(pacchetto: Uint8Array): Promise<void>;
    aggiungiAscoltatore(ascoltatore: (pacchetto: RispostaServo) => boolean | void): void;
}

type InAttesa = {
    id: number;
    risolvi: (risposta: RispostaServo) => void;
    timer: ReturnType<typeof setTimeout>;
};

export class Bus {
    private canale: Canale;
    private inAttesa: InAttesa | null = null;
    private coda: Promise<unknown> = Promise.resolve();

    constructor(canale: Canale) {
        this.canale = canale;
        // Il bus si "registra" sul canale: riceve ogni pacchetto prima del resto dell'applicazione
        canale.aggiungiAscoltatore((pacchetto) => this.suPacchetto(pacchetto));
    }

    // Restituisce true se il pacchetto era la risposta attesa (e quindi lo consuma)
    private suPacchetto(pacchetto: RispostaServo): boolean {
        if (this.inAttesa && pacchetto.id === this.inAttesa.id) {
            clearTimeout(this.inAttesa.timer);
            this.inAttesa.risolvi(pacchetto);
            this.inAttesa = null;
            return true;
        }
        return false; // risposta di un altro ID o non attesa: la lasciamo al resto dell'app
    }

    // Mette la richiesta in coda: parte solo quando quella precedente ha finito (risposta o timeout)
    richiedi(pacchetto: Uint8Array, idAtteso: number, timeoutMs = 100): Promise<RispostaServo> {
        const lavoro = this.coda.then(() => this.eseguiRichiesta(pacchetto, idAtteso, timeoutMs));
        this.coda = lavoro.catch(() => { }); // un errore non deve bloccare la coda
        return lavoro;
    }

    private eseguiRichiesta(pacchetto: Uint8Array, id: number, timeoutMs: number): Promise<RispostaServo> {
        return new Promise<RispostaServo>((risolvi, rifiuta) => {
            const timer = setTimeout(() => {
                this.inAttesa = null;
                rifiuta(new Error(`Il servo ${id} non risponde (timeout ${timeoutMs} ms)`));
            }, timeoutMs);
            this.inAttesa = { id, risolvi, timer };
            this.canale.invia(pacchetto).catch((errore) => {
                clearTimeout(timer);
                this.inAttesa = null;
                rifiuta(errore);
            });
        });
    }

    // --- scorciatoie ---
    async ping(id: number): Promise<boolean> {
        try {
            await this.richiedi(creaPacchetto(id, 0x01), id);
            return true;
        } catch {
            return false;
        }
    }

    async leggi(id: number, registro: number, quanti: number): Promise<number[]> {
        const risposta = await this.richiedi(creaPacchettoLettura(id, registro, quanti), id);
        return risposta.dati;
    }
}