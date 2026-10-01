# Laboratorio L1: servo Feetech STS da browser

Pilotare un servo Feetech serie STS direttamente dal browser, con la Web Serial API, senza librerie per la seriale. Progetto del laboratorio L1 del corso di Ingegneria del Cinema e dei Mezzi di Comunicazione (Politecnico di Torino).

L'app mostra ogni pacchetto scambiato con il servo byte per byte e spiega perché è fatto così. Ogni passo ha un pannello "Scopri di più" con il ripasso teorico.

## Cosa serve

- Un servo Feetech serie STS con **ID 1**, un adattatore USB verso il bus dei servo e un alimentatore a **12 V**.
- **Chrome o Edge** (Firefox dalla versione 151 funziona con un passaggio in più di permesso; Safari no).
- [Node.js](https://nodejs.org/) 22.12 o successivo (lo richiede Vitest; consigliato Node 24 LTS).

## Avvio

```bash
git clone https://github.com/Manis095/lab1.git
cd lab1
npm install
npm run dev
```

Apri http://localhost:5173 e premi **Collega**: il browser chiede di scegliere la porta seriale dell'adattatore.

Web Serial funziona solo su `localhost` o in `https`, e la porta si può scegliere solo con un clic.

| Comando | A cosa serve |
| --- | --- |
| `npm run dev` | server di sviluppo su http://localhost:5173 |
| `npm test` | test unitari (Vitest), non serve il servo |
| `npm run lint` | controllo del codice (ESLint) |
| `npm run build` | controllo dei tipi e build di produzione in `dist/` |

## I quattro passi

1. **Collegamento e ping**: apre la porta a 1 000 000 baud (8N1), invia un ping e controlla che lo stato sia 00.
2. **Posizione**: "Vai" scrive la posizione obiettivo (registro 42, 2 byte little endian), "Dove sei" legge la posizione attuale (registro 56). Una differenza di 1 o 2 unità è normale.
3. **Monitor**: ogni 100 ms legge carico, tensione, temperatura, movimento e corrente con una sola richiesta. Sforzando il servo a mano il carico sale.
4. **Sequenza**: una serie di posizioni; per ognuna aspetta che il servo arrivi entro 2 unità (massimo 3 s) e poi passa alla successiva. "Ferma" interrompe subito.

C'è anche un bottone **Diagnostica** che legge i registri a servo fermo e mette il valore grezzo accanto a quello atteso.

## Com'è fatto il codice

La comunicazione seriale è separata dall'interfaccia, così potrà essere riusata per i giunti del braccio.

```
src/
  serial/       comunicazione con il servo, senza interfaccia
    protocol.ts   costruzione e decodifica dei pacchetti, checksum, little endian
    parser.ts     separa i pacchetti dal flusso di byte
    connection.ts porta Web Serial: coda, timeout, chiusura ordinata, blocco scritture
    servo.ts      operazioni di alto livello (ping, posizione, telemetria)
    sequence.ts   sequenza di posizioni interrompibile
    registers.ts  indirizzi dei registri e conversioni (unico punto da correggere)
    config.ts     baud rate e timeout (unico punto da cambiare)
  learn/        funzioni pure e testi del ripasso "Scopri di più"
  components/   interfaccia React
```

## Sicurezza del servo

- La connessione **blocca con un errore** ogni scrittura sotto l'indirizzo 40 (area EEPROM: ID, baud rate...) e al registro 55, ogni istruzione diversa da ping, lettura e scrittura, e il broadcast. Un errore lì può rendere il servo irraggiungibile.
- La posizione è sempre limitata tra 0 e 4095.
- Il ritardo di risposta del servo (registro 7) non viene mai scritto.

## Da verificare prima di fidarsi

Alcune informazioni **non sono confermate** e nell'app sono etichettate "da verificare":

- i registri 40, 55, 60, 62, 63, 66 e 69 vengono da una tabella di terze parti dell'STS3215: vanno confermati con la documentazione sul portale del corso (il bottone Diagnostica aiuta a controllarli);
- il formato del carico (bit 0..9 valore, bit 10 direzione) e quale verso corrisponde alla direzione;
- il significato dei singoli bit del byte di stato: l'app mostra sempre anche il valore esadecimale grezzo;
- il timeout di 50 ms è una stima: se compaiono molti timeout con alimentazione e cavi a posto, si alza in `src/serial/config.ts`.

## Se qualcosa non va

- **"Impossibile aprire la porta"**: chiudi le altre schede o i programmi che la usano; se non basta scollega e ricollega il cavo USB.
- **Molti timeout di fila**: controlla l'alimentazione a 12 V e il cablaggio.
- **Il servo va a fine corsa**: probabili byte invertiti; la posizione va inviata in little endian (byte basso prima).

## Branch

- `ui-didattica` (predefinito): l'interfaccia completa con pacchetti scomposti, grafici, ripasso teorico e tema scuro.
- `master`: la versione base dei quattro passi.
