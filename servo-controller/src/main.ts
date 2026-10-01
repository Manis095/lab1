import { GestoreSeriale } from './seriale';
import { 
  creaPacchetto, 
  creaPacchettoScrittura16, 
  creaPacchettoLettura,
  creaPacchettoPosizioneVelocita,
  decodifica16, 
  stepInGradi, 
  toHex 
} from './protocollo';

const seriale = new GestoreSeriale();

// Elementi della UI
const sezDisconnesso = document.getElementById('sezione-disconnesso') as HTMLDivElement;
const sezConnesso = document.getElementById('sezione-connesso') as HTMLDivElement;
const btnConnetti = document.getElementById('btn-connetti') as HTMLButtonElement;
const btnPing = document.getElementById('btn-ping') as HTMLButtonElement;
const btnDisconnetti = document.getElementById('btn-disconnetti') as HTMLButtonElement;
const logDiv = document.getElementById('log') as HTMLDivElement;
const btnLeggiPos = document.getElementById('btn-leggi-pos') as HTMLButtonElement;
const sliderPos = document.getElementById('slider-pos') as HTMLInputElement;
const labelGradi = document.getElementById('label-gradi') as HTMLSpanElement;
const labelStep = document.getElementById('label-step') as HTMLSpanElement;
const sliderVel = document.getElementById('slider-vel') as HTMLInputElement;
const labelVel = document.getElementById('label-vel') as HTMLSpanElement;

// Aggiorna l'etichetta al trascinamento
sliderVel.addEventListener('input', () => {
  labelVel.textContent = sliderVel.value;
});

function scriviLog(messaggio: string) {
  const orario = new Date().toLocaleTimeString();
  logDiv.textContent += `\n[${orario}] ${messaggio}`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

// Callback quando arriva un pacchetto valido dal parser
seriale.onPacchettoRicevuto = (pacchetto) => {
  scriviLog(`<- RX [${toHex(pacchetto.byteGrezzi)}]`);
  
  // Se arrivano 2 byte di dati, è la risposta alla lettura di posizione (o registro a 16 bit)
  if (pacchetto.dati.length === 2) {
    const stepReali = decodifica16(pacchetto.dati[0], pacchetto.dati[1]);
    const gradiReali = stepInGradi(stepReali);
    scriviLog(`   -> POSIZIONE REALE: ${gradiReali}° (${stepReali} step)`);
  } else {
    scriviLog(`   -> ID: ${pacchetto.id} | Stato: 0x${pacchetto.stato.toString(16).padStart(2, '0')} | Dati: [${toHex(pacchetto.dati)}]`);
  }

  if (pacchetto.stato !== 0) {
    scriviLog(`   -> ATTENZIONE: Anomalia nel byte di stato (0x${pacchetto.stato.toString(16)})`);
  }
};

// Click su Connetti
btnConnetti.addEventListener('click', async () => {
  try {
    scriviLog("Apertura finestra di selezione porta...");
    await seriale.connetti();
    scriviLog("Porta aperta con successo a 1 Mbit/s.");

    // Alterniamo i pulsanti visibili
    sezDisconnesso.classList.add('nascosto');
    sezConnesso.classList.remove('nascosto');
  } catch (err: any) {
    scriviLog(`Errore di connessione: ${err.message}`);
  }
});

// Click su Invia Ping
btnPing.addEventListener('click', async () => {
  try {
    // Ping al Servo 1: Istruzione 0x01
    const ping = creaPacchetto(0x01, 0x01);
    scriviLog(`-> TX [${toHex(ping)}] (Ping Servo 1)`);
    await seriale.invia(ping);
  } catch (err: any) {
    scriviLog(`Errore invio PING: ${err.message}`);
  }
});

// Click su Disconnetti
btnDisconnetti.addEventListener('click', async () => {
  try {
    await seriale.disconnetti();
    scriviLog("Porta chiusa correttamente.");

    // Ripristiniamo i pulsanti iniziali
    sezConnesso.classList.add('nascosto');
    sezDisconnesso.classList.remove('nascosto');
  } catch (err: any) {
    scriviLog(`Errore durante la disconnessione: ${err.message}`);
  }
});

// Invio della posizione al rilascio dello slider (evento 'change')
sliderPos.addEventListener('change', async () => {
  const step = parseInt(sliderPos.value, 10);
  const vel = parseInt(sliderVel.value, 10);
  const gradi = stepInGradi(step);

  try {
    // Scrittura combinata Posizione + Tempo (0) + Velocità
    const pacchettoScrittura = creaPacchettoPosizioneVelocita(0x01, step, vel, 0);
    scriviLog(`-> TX [${toHex(pacchettoScrittura)}] (Pos: ${gradi}°, Vel: ${vel} step/s)`);
    await seriale.invia(pacchettoScrittura);
  } catch (err: any) {
    scriviLog(`Errore invio comando: ${err.message}`);
  }
});

// Aggiornamento live delle etichette mentre trascini lo slider
sliderPos.addEventListener('input', () => {
  const step = parseInt(sliderPos.value, 10);
  labelStep.textContent = step.toString();
  labelGradi.textContent = `${stepInGradi(step)}°`;
});

// Lettura della posizione corrente dal registro 56 (0x38), 2 byte
btnLeggiPos.addEventListener('click', async () => {
  try {
    const pacchettoLettura = creaPacchettoLettura(0x01, 0x38, 2);
    scriviLog(`-> TX [${toHex(pacchettoLettura)}] (Richiesta posizione corrente)`);
    await seriale.invia(pacchettoLettura);
  } catch (err: any) {
    scriviLog(`Errore lettura posizione: ${err.message}`);
  }
});