// Testi dei pannelli "Scopri di più". Solo dati: i componenti li impaginano.
//
// Ogni affermazione ha un'etichetta:
// - lezione:    presentato a lezione (o nella scheda del laboratorio);
// - confermato: verificato dai vettori e dai test unitari del progetto, o da
//               una specifica ufficiale (Web Serial, USB, livelli TTL);
// - verificare: non confermato, da controllare sul portale del corso o sul servo.

export type Tag = 'lezione' | 'confermato' | 'verificare'

export const TAG_LABELS: Record<Tag, string> = {
  lezione: 'dalla lezione',
  confermato: 'confermato',
  verificare: 'da verificare',
}

export const TAG_LEGEND: { tag: Tag; text: string }[] = [
  { tag: 'lezione', text: 'presentato a lezione o nella scheda del laboratorio' },
  {
    tag: 'confermato',
    text: 'verificato dai vettori di test e dai test unitari del progetto, oppure da una specifica ufficiale',
  },
  { tag: 'verificare', text: 'non ancora confermato: da controllare sul portale del corso o sul servo' },
]

/** Esempi interattivi inseriti nel testo; usano i dati reali quando ci sono. */
export type WidgetId =
  | 'architecture'
  | 'packetFormat'
  | 'checksum'
  | 'littleEndian'
  | 'parserStepper'
  | 'loadDecode'
  | 'sequenceFlow'

export interface Claim {
  tag: Tag
  text: string
}

export type Block =
  | { kind: 'claims'; items: Claim[] }
  | { kind: 'widget'; widget: WidgetId }
  | { kind: 'steps'; tag: Tag; intro: string; items: string[] }

export interface LearnSection {
  title: string
  blocks: Block[]
}

export type TopicId = 'overview' | 'step1' | 'step2' | 'step3' | 'step4'

export interface LearnTopic {
  id: TopicId
  title: string
  /** Riga "Cosa succede" mostrata in cima alla scheda del passo. */
  whatHappens: string
  sections: LearnSection[]
}

export const LEARN_TOPICS: Record<TopicId, LearnTopic> = {
  overview: {
    id: 'overview',
    title: "Come è fatta l'app",
    whatHappens:
      'Il browser parla con il servo attraverso la Web Serial API: ogni comando è un pacchetto di pochi byte, ogni risposta pure.',
    sections: [
      {
        title: 'Architettura a strati',
        blocks: [
          { kind: 'widget', widget: 'architecture' },
          {
            kind: 'claims',
            items: [
              {
                tag: 'confermato',
                text: "La comunicazione seriale sta tutta in src/serial e non importa nulla dall'interfaccia. Lo stesso codice servirà per i giunti del braccio.",
              },
              {
                tag: 'confermato',
                text: 'protocol.ts costruisce e decodifica i pacchetti con funzioni pure: si provano senza browser e senza servo.',
              },
              {
                tag: 'confermato',
                text: 'parser.ts separa i pacchetti dal flusso di byte; connection.ts apre la porta, mette in coda le richieste e gestisce timeout e chiusura; servo.ts offre operazioni come "leggi posizione".',
              },
              {
                tag: 'confermato',
                text: 'I componenti in src/components mostrano soltanto: non costruiscono byte e non toccano la porta.',
              },
            ],
          },
        ],
      },
      {
        title: 'Il collegamento fisico',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'UART 8N1 a 1 000 000 baud: 8 bit di dati, nessuna parità, 1 bit di stop. Con il bit di start un carattere occupa 10 bit, cioè 10 µs.',
              },
              {
                tag: 'lezione',
                text: 'Il bus dei servo è half duplex su un filo solo: PC e servo parlano a turno sullo stesso conduttore e il servo trasmette soltanto se interrogato.',
              },
              {
                tag: 'confermato',
                text: "Anche USB 2.0, tra PC e adattatore, è half duplex sul filo: una sola coppia differenziale, e il PC decide a turno chi trasmette. La porta seriale virtuale appare full duplex solo a livello logico, perché il driver tiene due code separate per i due versi.",
              },
              {
                tag: 'confermato',
                text: 'Le soglie 0,8 V e 2,0 V dei livelli TTL non sono un\'isteresi: sono i limiti di ingresso. Sotto 0,8 V il ricevitore legge 0, sopra 2,0 V legge 1, in mezzo il valore non è garantito.',
              },
              {
                tag: 'confermato',
                text: 'La distanza tra questi limiti e i livelli garantiti in uscita dal trasmettitore (per esempio 0,4 V per lo 0 e 2,4 V per l\'1) è il margine di rumore: il disturbo che il segnale può sopportare senza essere letto male.',
              },
              {
                tag: 'confermato',
                text: "L'isteresi è un'altra cosa: un ingresso a trigger di Schmitt usa due soglie diverse per il fronte in salita e per quello in discesa, così un segnale rumoroso vicino alla soglia non fa commutare l'uscita avanti e indietro.",
              },
            ],
          },
        ],
      },
    ],
  },

  step1: {
    id: 'step1',
    title: 'Passo 1: collegamento e ping',
    whatHappens:
      'Collega apre la porta seriale a 1 Mbaud e invia un ping al servo ID 1. Se il servo risponde con stato 00 il collegamento funziona.',
    sections: [
      {
        title: 'Il formato del pacchetto',
        blocks: [
          { kind: 'widget', widget: 'packetFormat' },
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'Ogni pacchetto inizia con FF FF, poi ID del destinatario, LEN, istruzione, parametri e checksum.',
              },
              {
                tag: 'lezione',
                text: 'LEN conta i byte che seguono LEN, checksum compreso: la lunghezza totale è 4 + LEN.',
              },
              {
                tag: 'lezione',
                text: "La risposta ha la stessa struttura, ma al posto dell'istruzione c'è il byte di stato ERR.",
              },
              {
                tag: 'lezione',
                text: 'Istruzioni: 1 ping, 2 lettura, 3 scrittura. ID da 0 a 253, 254 è il broadcast; il servo del laboratorio ha ID 1.',
              },
            ],
          },
        ],
      },
      {
        title: 'Il checksum',
        blocks: [
          { kind: 'widget', widget: 'checksum' },
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'Si sommano i byte da ID a fine parametri (FF FF esclusi), si tiene il resto della divisione per 256 e si fa il complemento a uno: (~somma) & 0xFF.',
              },
              {
                tag: 'confermato',
                text: 'I vettori della scheda, per esempio ping ID 1 = FF FF 01 02 01 FB, sono verificati dai test unitari.',
              },
              {
                tag: 'confermato',
                text: 'Un pacchetto con checksum sbagliato viene scartato dal parser: meglio nessuna risposta che una risposta corrotta.',
              },
            ],
          },
        ],
      },
      {
        title: 'Il byte di stato',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'Stato 00 significa nessuna anomalia. Il servo risponde anche quando segnala un allarme, quindi lo stato va controllato a ogni risposta.',
              },
              {
                tag: 'verificare',
                text: "Il significato dei singoli bit (tensione, temperatura, sovraccarico, istruzione non valida) non è confermato per la serie STS. Per questo l'app mostra sempre anche il valore esadecimale grezzo.",
              },
            ],
          },
        ],
      },
      {
        title: 'Una richiesta alla volta',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: "Sul bus half duplex c'è una sola richiesta in volo: si invia, si aspetta la risposta o il timeout, poi si passa alla successiva.",
              },
              {
                tag: 'confermato',
                text: 'SerialConnection.request() mette le richieste in coda: due richieste lanciate insieme partono una dopo l\'altra e ricevono ciascuna la propria risposta. Lo verifica un test, e il bottone "Due richieste di fila" lo mostra sul servo.',
              },
              {
                tag: 'confermato',
                text: 'Una risposta è accettata solo se ha lo stesso ID della richiesta e il numero di dati atteso.',
              },
              {
                tag: 'lezione',
                text: 'Un timeout sporadico è normale; molti di fila indicano un problema di alimentazione a 12 V o di cablaggio.',
              },
              {
                tag: 'verificare',
                text: 'Il timeout di 50 ms è una stima: dipende dal ritardo di risposta del servo (registro 7, che non tocchiamo) e dalla latenza dell\'adattatore USB. Si cambia in un solo punto, src/serial/config.ts.',
              },
              {
                tag: 'verificare',
                text: 'Alcuni adattatori rimandano indietro i byte trasmessi (eco). La connessione ignora il pacchetto identico a quello appena inviato; se il vostro adattatore lo fa, nel log compare la riga "Eco del pacchetto trasmesso ignorata".',
              },
            ],
          },
        ],
      },
      {
        title: 'Aprire e chiudere la porta',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'confermato',
                text: 'requestPort() funziona solo durante un gesto dell\'utente: per questo è chiamato dal clic su Collega e mai da un effetto React.',
              },
              {
                tag: 'confermato',
                text: 'Dopo open() si prendono un solo lettore e un solo scrittore: bloccano i flussi in modo esclusivo.',
              },
            ],
          },
          {
            kind: 'steps',
            tag: 'lezione',
            intro: 'La chiusura ordinata segue sempre questi passi; saltarne uno lascia la porta occupata e dopo un ricaricamento open() fallisce:',
            items: [
              'attivo = false, così il ciclo di lettura sa che deve fermarsi;',
              'await reader.cancel(): la read() in sospeso termina;',
              'reader.releaseLock();',
              'writer.releaseLock();',
              'await port.close().',
            ],
          },
          {
            kind: 'claims',
            items: [
              {
                tag: 'confermato',
                text: 'Un test verifica che dopo disconnect() i flussi siano sbloccati, la porta chiusa e di nuovo apribile.',
              },
              {
                tag: 'confermato',
                text: 'La chiusura parte anche su pagehide, nel cleanup di React (in sviluppo StrictMode esegue gli effetti due volte) e nel ricaricamento a caldo di Vite.',
              },
            ],
          },
        ],
      },
    ],
  },

  step2: {
    id: 'step2',
    title: 'Passo 2: posizione',
    whatHappens:
      'Vai scrive la posizione obiettivo nel registro 42. Dove sei legge la posizione attuale dal registro 56. Sono due operazioni separate: il motore ha bisogno di tempo per arrivare.',
    sections: [
      {
        title: 'Da numero a byte: little endian',
        blocks: [
          { kind: 'widget', widget: 'littleEndian' },
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'La posizione va da 0 a 4095: un giro diviso in 4096 parti, circa 0,088° per unità.',
              },
              {
                tag: 'lezione',
                text: 'I valori a 16 bit viaggiano con il byte basso prima e l\'alto dopo: 3000 = 0x0BB8 diventa B8 0B.',
              },
              {
                tag: 'lezione',
                text: 'Se si invertono i byte il servo non segnala errori: legge 0xB80B = 47115, satura e va a fine corsa.',
              },
              {
                tag: 'confermato',
                text: 'Per questo l\'app segnala "probabili byte invertiti" quando la lettura è a fine corsa mentre l\'obiettivo non lo è.',
              },
            ],
          },
        ],
      },
      {
        title: 'I registri e i comandi',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'Posizione obiettivo al registro 42 (0x2A), posizione attuale al 56 (0x38), entrambi 2 byte little endian.',
              },
              {
                tag: 'lezione',
                text: 'Scrittura: FF FF ID (3 + numero di dati) 03 indirizzo dati CHK. Lettura: FF FF ID 04 02 indirizzo N CHK.',
              },
              {
                tag: 'confermato',
                text: 'Scrittura di 2048 al registro 42: FF FF 01 05 03 2A 00 08 C4, verificato dai test.',
              },
            ],
          },
        ],
      },
      {
        title: 'Perché due bottoni separati',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'Il motore non arriva subito: leggere appena dopo la scrittura mostrerebbe una posizione intermedia. Per questo Vai scrive soltanto e Dove sei legge quando lo decidi tu.',
              },
              {
                tag: 'lezione',
                text: 'Una differenza di 1 o 2 unità tra obiettivo e lettura è normale: è il gioco degli ingranaggi.',
              },
              {
                tag: 'confermato',
                text: 'La differenza si calcola sul cerchio: 0 e 4095 sono vicini, quindi obiettivo 0 e lettura 4095 differiscono di 1 unità.',
              },
            ],
          },
        ],
      },
      {
        title: 'Sicurezza del servo',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: "Sotto l'indirizzo 40 c'è l'area EEPROM, con ID e baud rate: un errore lì può rendere il servo irraggiungibile.",
              },
              {
                tag: 'verificare',
                text: 'Secondo una tabella di terze parti dell\'STS3215 l\'EEPROM va da 0 a 36 e il registro 55 sblocca la scrittura in EEPROM.',
              },
              {
                tag: 'confermato',
                text: 'Prima di trasmettere, SerialConnection blocca con un errore ogni scrittura sotto 40 o che comprende il 55 (anche 2 byte a partire da 54), ogni istruzione diversa da ping, lettura e scrittura, e il broadcast. Lo verificano i test.',
              },
              {
                tag: 'confermato',
                text: 'La posizione viene sempre limitata tra 0 e 4095 prima dell\'invio, e il ritardo di risposta (registro 7) non viene mai scritto.',
              },
            ],
          },
        ],
      },
    ],
  },

  step3: {
    id: 'step3',
    title: 'Passo 3: parser e telemetria',
    whatHappens:
      'Ogni 100 ms una sola richiesta legge 11 byte dal registro 60: carico, tensione, temperatura, movimento e corrente. Sforzando il servo a mano il carico sale.',
    sections: [
      {
        title: 'Il parser a stati',
        blocks: [
          { kind: 'widget', widget: 'parserStepper' },
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'read() restituisce i byte disponibili in quel momento, non un pacchetto: una risposta può arrivare spezzata o attaccata alla precedente.',
              },
              {
                tag: 'lezione',
                text: 'feed() accoda i byte. Finché ce ne sono almeno 4 controlla che i primi due siano FF FF, altrimenti scarta un byte e si risincronizza. Calcola totale = 4 + LEN e, se mancano byte, aspetta.',
              },
              {
                tag: 'lezione',
                text: 'Con il pacchetto completo verifica il checksum. Se è sbagliato scarta un solo byte e riprova, perché FF FF può comparire anche dentro i dati; se è giusto estrae il pacchetto e lascia nel buffer il resto.',
              },
              {
                tag: 'confermato',
                text: 'Un LEN minore di 2 non può essere un pacchetto e viene scartato. Dopo un timeout il buffer si svuota, così un LEN spurio non blocca le risposte successive.',
              },
            ],
          },
        ],
      },
      {
        title: 'Una lettura sola per tutti i valori',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'confermato',
                text: 'Il monitor legge i registri da 60 a 70 con una sola richiesta: meno traffico sul bus. Il ciclo aspetta ogni risposta prima di programmare la lettura successiva, quindi le richieste non si sovrappongono.',
              },
              {
                tag: 'verificare',
                text: 'Carico al 60 (2 byte), tensione al 62 (unità da 0,1 V), temperatura al 63 (°C), in movimento al 66, corrente al 69 (2 byte, unità da 6,5 mA): tabella di terze parti dell\'STS3215, da confermare sul portale del corso.',
              },
            ],
          },
        ],
      },
      {
        title: 'Decodificare il carico',
        blocks: [
          { kind: 'widget', widget: 'loadDecode' },
          {
            kind: 'claims',
            items: [
              {
                tag: 'verificare',
                text: 'Bit da 0 a 9: valore da 0 a 1000, dove 1000 è il 100% della coppia massima. Bit 10: direzione.',
              },
              {
                tag: 'verificare',
                text: 'Quale verso di rotazione corrisponda a direzione 0 e quale a 1: annotatelo sforzando il servo nei due versi.',
              },
              {
                tag: 'confermato',
                text: 'Valori sopra 1000 o bit alti inattesi vengono segnalati come formato non plausibile invece di essere mostrati come percentuale.',
              },
            ],
          },
        ],
      },
      {
        title: 'Diagnostica',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'confermato',
                text: 'Il bottone Diagnostica legge una volta i registri 56, 60, 62, 63, 66 e 69, uno per richiesta, e mette il valore grezzo accanto a quello convertito.',
              },
              {
                tag: 'verificare',
                text: 'Valori attesi a servo fermo: tensione grezza circa 120, temperatura tra 20 e 45 °C, carico vicino a 0, movimento 0. Se tornano, la tabella di terze parti è confermata sul vostro servo.',
              },
            ],
          },
        ],
      },
    ],
  },

  step4: {
    id: 'step4',
    title: 'Passo 4: sequenza di posizioni',
    whatHappens:
      'Per ogni tappa la sequenza scrive l\'obiettivo e rilegge la posizione finché il servo è arrivato (entro 2 unità) o sono passati 3 s. Poi passa alla tappa successiva.',
    sections: [
      {
        title: "L'algoritmo",
        blocks: [
          { kind: 'widget', widget: 'sequenceFlow' },
          {
            kind: 'claims',
            items: [
              {
                tag: 'lezione',
                text: 'Per ogni posizione: scrivi l\'obiettivo, rileggi periodicamente la posizione finché è entro 2 unità, con un tempo massimo di circa 3 s, poi passa alla successiva.',
              },
              {
                tag: 'confermato',
                text: 'La lettura avviene ogni 50 ms. Un timeout sporadico di lettura non ferma la sequenza; se il tempo massimo scade la tappa è segnata "non arrivato" e si prosegue.',
              },
            ],
          },
        ],
      },
      {
        title: 'Interruzione immediata',
        blocks: [
          {
            kind: 'claims',
            items: [
              {
                tag: 'confermato',
                text: 'Ferma annulla un AbortController: l\'attesa tra una lettura e l\'altra termina subito e non partono altri comandi. Un test verifica che dopo lo stop non ci siano nuove scritture.',
              },
              {
                tag: 'confermato',
                text: 'Una richiesta già in volo termina da sola entro il timeout. Il servo completa il movimento verso l\'ultimo obiettivo già scritto.',
              },
              {
                tag: 'confermato',
                text: 'runSequence() usa solo due operazioni, scrivi obiettivo e leggi posizione: lo stesso codice potrà muovere un giunto del braccio.',
              },
            ],
          },
        ],
      },
    ],
  },
}
