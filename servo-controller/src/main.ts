import { GestoreSeriale } from './seriale';
import { 
  creaPacchetto, 
  creaPacchettoScrittura8,
  creaPacchettoLettura,
  creaPacchettoPosizioneVelocita,
  decodifica16, 
  stepInGradi, 
  toHex 
} from './protocollo';

const seriale = new GestoreSeriale();

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

const btnCoppiaOn = document.getElementById('btn-coppia-on') as HTMLButtonElement;
const btnCoppiaOff = document.getElementById('btn-coppia-off') as HTMLButtonElement;
const statoCoppiaSpan = document.getElementById('stato-coppia') as HTMLSpanElement;

const labelCarico = document.getElementById('label-carico') as HTMLSpanElement;
const barraCarico = document.getElementById('barra-carico') as HTMLDivElement;
const labelTemp = document.getElementById('label-temp') as HTMLSpanElement;
const bloccoTelemetria = document.getElementById('blocco-telemetria') as HTMLDivElement;
const btnLeggiTelemetria = document.getElementById('btn-leggi-telemetria') as HTMLButtonElement;
const chkAutoTelemetria = document.getElementById('chk-auto-telemetria') as HTMLInputElement;

let timerTelemetria: number | null = null;
let ultimoRegistro1ByteRichiesto: number | null = null;
const SOGLIA_TEMPERATURA_CRITICA = 60;

function aggiornaIconaLock(attivo: boolean) {
  if (attivo) {
    statoCoppiaSpan.textContent = '🔒 Lock Attivo';
    statoCoppiaSpan.style.color = '#2e7d32';
  } else {
    statoCoppiaSpan.textContent = '🔓 Lock Disattivato';
    statoCoppiaSpan.style.color = '#d32f2f';
  }
}

sliderVel.addEventListener('input', () => {
  labelVel.textContent = sliderVel.value;
});

function scriviLog(messaggio: string) {
  const orario = new Date().toLocaleTimeString();
  logDiv.textContent += `\n[${orario}] ${messaggio}`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

seriale.onPacchettoRicevuto = (pacchetto) => {
  scriviLog(`<- RX [${toHex(pacchetto.byteGrezzi)}]`);

  if (pacchetto.dati.length === 4) {
    const caricoGrezzo = decodifica16(pacchetto.dati[0], pacchetto.dati[1]);
    const caricoEffettivo = caricoGrezzo & 0x03FF;
    const temp = pacchetto.dati[3];

    labelCarico.textContent = `${caricoEffettivo}`;
    const percentualeCarico = Math.min(100, Math.round((caricoEffettivo / 1000) * 100));
    barraCarico.style.width = `${percentualeCarico}%`;

    labelTemp.textContent = `${temp} °C`;

    if (temp >= SOGLIA_TEMPERATURA_CRITICA) {
      bloccoTelemetria.classList.add('allarme-temperatura');
    } else {
      bloccoTelemetria.classList.remove('allarme-temperatura');
    }

    scriviLog(`   -> CARICO: ${caricoEffettivo} | TEMP: ${temp} °C`);
  } else if (pacchetto.dati.length === 2) {
    const stepReali = decodifica16(pacchetto.dati[0], pacchetto.dati[1]);
    const gradiReali = stepInGradi(stepReali);
    scriviLog(`   -> POSIZIONE: ${gradiReali}° (${stepReali} step)`);
  } else if (pacchetto.dati.length === 1) {
    const valore = pacchetto.dati[0];
    if (ultimoRegistro1ByteRichiesto === 0x28) {
      aggiornaIconaLock(valore === 1);
      scriviLog(`   -> STATO LOCK: ${valore === 1 ? 'Attivo' : 'Disattivato'}`);
    } else {
      labelTemp.textContent = `${valore} °C`;
      scriviLog(`   -> TEMPERATURA: ${valore} °C`);

      if (valore >= SOGLIA_TEMPERATURA_CRITICA) {
        bloccoTelemetria.classList.add('allarme-temperatura');
      } else {
        bloccoTelemetria.classList.remove('allarme-temperatura');
      }
    }
  } else {
    scriviLog(`   -> ID: ${pacchetto.id} | Stato: 0x${pacchetto.stato.toString(16).padStart(2, '0')}`);
  }

  if (pacchetto.stato !== 0) {
    scriviLog(`   -> ATTENZIONE: Anomalia byte stato (0x${pacchetto.stato.toString(16)})`);
  }
};

async function richiediTelemetria() {
  try {
    const p = creaPacchettoLettura(0x01, 0x3C, 4);
    await seriale.invia(p);
  } catch (err: any) {
    scriviLog(`Errore telemetria: ${err.message}`);
  }
}

btnLeggiTelemetria.addEventListener('click', () => {
  richiediTelemetria();
});

chkAutoTelemetria.addEventListener('change', () => {
  if (chkAutoTelemetria.checked) {
    timerTelemetria = window.setInterval(richiediTelemetria, 300);
  } else if (timerTelemetria !== null) {
    clearInterval(timerTelemetria);
    timerTelemetria = null;
  }
});

btnConnetti.addEventListener('click', async () => {
  try {
    scriviLog("Apertura finestra di selezione porta...");
    await seriale.connetti();
    scriviLog("Porta aperta con successo a 1 Mbit/s.");

    sezDisconnesso.classList.add('nascosto');
    sezConnesso.classList.remove('nascosto');

    ultimoRegistro1ByteRichiesto = 0x28;
    const reqCoppia = creaPacchettoLettura(0x01, 0x28, 1);
    await seriale.invia(reqCoppia);
  } catch (err: any) {
    scriviLog(`Errore di connessione: ${err.message}`);
  }
});

btnPing.addEventListener('click', async () => {
  try {
    const ping = creaPacchetto(0x01, 0x01);
    scriviLog(`-> TX [${toHex(ping)}] (Ping Servo 1)`);
    await seriale.invia(ping);
  } catch (err: any) {
    scriviLog(`Errore invio PING: ${err.message}`);
  }
});

btnDisconnetti.addEventListener('click', async () => {
  try {
    if (timerTelemetria !== null) {
      clearInterval(timerTelemetria);
      timerTelemetria = null;
      chkAutoTelemetria.checked = false;
    }

    statoCoppiaSpan.textContent = '🔒 Stato: Sconosciuto';
    statoCoppiaSpan.style.color = 'inherit';

    await seriale.disconnetti();
    scriviLog("Porta chiusa correttamente.");

    sezConnesso.classList.add('nascosto');
    sezDisconnesso.classList.remove('nascosto');
  } catch (err: any) {
    scriviLog(`Errore durante la disconnessione: ${err.message}`);
  }
});

sliderPos.addEventListener('change', async () => {
  const step = parseInt(sliderPos.value, 10);
  const vel = parseInt(sliderVel.value, 10);
  const gradi = stepInGradi(step);

  try {
    const pacchettoScrittura = creaPacchettoPosizioneVelocita(0x01, step, vel, 0);
    scriviLog(`-> TX [${toHex(pacchettoScrittura)}] (Pos: ${gradi}°, Vel: ${vel} step/s)`);
    await seriale.invia(pacchettoScrittura);
  } catch (err: any) {
    scriviLog(`Errore invio comando: ${err.message}`);
  }
});

sliderPos.addEventListener('input', () => {
  const step = parseInt(sliderPos.value, 10);
  labelStep.textContent = step.toString();
  labelGradi.textContent = `${stepInGradi(step)}°`;
});

btnLeggiPos.addEventListener('click', async () => {
  try {
    const pacchettoLettura = creaPacchettoLettura(0x01, 0x38, 2);
    scriviLog(`-> TX [${toHex(pacchettoLettura)}] (Richiesta posizione corrente)`);
    await seriale.invia(pacchettoLettura);
  } catch (err: any) {
    scriviLog(`Errore lettura posizione: ${err.message}`);
  }
});

btnCoppiaOn.addEventListener('click', async () => {
  try {
    const p = creaPacchettoScrittura8(0x01, 0x28, 1);
    scriviLog(`-> TX [${toHex(p)}] (Abilita lock)`);
    await seriale.invia(p);
    aggiornaIconaLock(true);
  } catch (err: any) {
    scriviLog(`Errore: ${err.message}`);
  }
});

btnCoppiaOff.addEventListener('click', async () => {
  try {
    const p = creaPacchettoScrittura8(0x01, 0x28, 0);
    scriviLog(`-> TX [${toHex(p)}] (Disabilita lock)`);
    await seriale.invia(p);
    aggiornaIconaLock(false);
  } catch (err: any) {
    scriviLog(`Errore: ${err.message}`);
  }
});