import { GestoreSeriale } from './seriale';
import { 
  creaPacchetto, 
  creaPacchettoScrittura8,
  creaPacchettoLettura,
  creaPacchettoPosizioneVelocita,
  creaPacchettoSyncWrite2Servi,
  decodifica16, 
  stepInGradi, 
  toHex 
} from './protocollo';
import { 
  L1, 
  L2, 
  diretta, 
  inversa, 
  radToDeg, 
  radToStep,
  type SoluzioneInversa 
} from './cinematica';

const seriale = new GestoreSeriale();

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    console.error(`[ERRORE DOM] Elemento #${id} non trovato in index.html!`);
  }
  return el as T;
}

// UI Generale
const sezDisconnesso = getEl<HTMLDivElement>('sezione-disconnesso');
const sezConnesso = getEl<HTMLDivElement>('sezione-connesso');
const btnConnetti = getEl<HTMLButtonElement>('btn-connetti');
const btnSimulazione = getEl<HTMLButtonElement>('btn-simulazione');
const btnDisconnetti = getEl<HTMLButtonElement>('btn-disconnetti');
const logDiv = getEl<HTMLDivElement>('log');

// Test Motori Singoli
const btnPing1 = getEl<HTMLButtonElement>('btn-ping-1');
const btnPing2 = getEl<HTMLButtonElement>('btn-ping-2');
const btnLeggiPos1 = getEl<HTMLButtonElement>('btn-leggi-pos-1');
const btnLeggiPos2 = getEl<HTMLButtonElement>('btn-leggi-pos-2');

// Telemetria Dual-Servo
const labelCarico1 = getEl<HTMLSpanElement>('label-carico-1');
const barraCarico1 = getEl<HTMLDivElement>('barra-carico-1');
const labelTemp1 = getEl<HTMLSpanElement>('label-temp-1');

const labelCarico2 = getEl<HTMLSpanElement>('label-carico-2');
const barraCarico2 = getEl<HTMLDivElement>('barra-carico-2');
const labelTemp2 = getEl<HTMLSpanElement>('label-temp-2');

const bloccoTelemetria = getEl<HTMLDivElement>('blocco-telemetria');
const btnLeggiTelemetria = getEl<HTMLButtonElement>('btn-leggi-telemetria');
const chkAutoTelemetria = getEl<HTMLInputElement>('chk-auto-telemetria');

// Spazio Giunti (Joint Space Sliders)
const sliderJ1 = getEl<HTMLInputElement>('slider-j1');
const labelJ1Gradi = getEl<HTMLSpanElement>('label-j1-gradi');
const labelJ1Step = getEl<HTMLSpanElement>('label-j1-step');

const sliderJ2 = getEl<HTMLInputElement>('slider-j2');
const labelJ2Gradi = getEl<HTMLSpanElement>('label-j2-gradi');
const labelJ2Step = getEl<HTMLSpanElement>('label-j2-step');

// Spazio Cartesiano Manuale
const inputManualX = getEl<HTMLInputElement>('input-manual-x');
const inputManualY = getEl<HTMLInputElement>('input-manual-y');
const btnSpostaCartesiano = getEl<HTMLButtonElement>('btn-sposta-cartesiano');

// Lock Coppia
const btnCoppiaOn = getEl<HTMLButtonElement>('btn-coppia-on');
const btnCoppiaOff = getEl<HTMLButtonElement>('btn-coppia-off');
const statoCoppiaSpan = getEl<HTMLSpanElement>('stato-coppia');

// Automazione & Sicurezza
const inputCx = getEl<HTMLInputElement>('input-cx');
const inputCy = getEl<HTMLInputElement>('input-cy');
const inputRaggio = getEl<HTMLInputElement>('input-raggio');
const inputDurata = getEl<HTMLInputElement>('input-durata');
const btnAvviaCerchio = getEl<HTMLButtonElement>('btn-avvia-cerchio');

const btnInviaPos = getEl<HTMLButtonElement>('btn-invia-pos');
const chkLiveHardware = getEl<HTMLInputElement>('chk-live-hardware');

// Canvas
const canvas = getEl<HTMLCanvasElement>('simulatore-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const infoTarget = getEl<HTMLSpanElement>('info-target');
const infoAngoli = getEl<HTMLSpanElement>('info-angoli');
const infoStato = getEl<HTMLSpanElement>('info-stato');
const selectGomito = getEl<HTMLSelectElement>('select-gomito');

const CENTRO_X = canvas ? canvas.width / 2 : 400;
const CENTRO_Y = canvas ? canvas.height / 2 : 400;

// Costanti Offset Hardware
const OFFSET_BASE = 2048;   // ID 1
const OFFSET_GOMITO = 2048; // ID 2
const SOGLIA_TEMPERATURA_CRITICA = 60;

// Stato Applicazione
let animazioneAttiva = false;
let puntoFissato = false;
let gomitoCorrente = 1;
let solCorrente: SoluzioneInversa = { t1: 0, t2: 0, raggiungibile: true };
let targetX_corrente = 200;
let targetY_corrente = 100;

let tempServo1 = 0;
let tempServo2 = 0;
let timerTelemetria: number | null = null;
let ultimoRegistro1ByteRichiesto: number | null = null;

function scriviLog(messaggio: string) {
  if (!logDiv) return;
  const orario = new Date().toLocaleTimeString();
  logDiv.textContent += `\n[${orario}] ${messaggio}`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

function aggiornaIconaLock(attivo: boolean) {
  if (!statoCoppiaSpan) return;
  if (attivo) {
    statoCoppiaSpan.textContent = '🔒 Lock Attivo';
    statoCoppiaSpan.style.color = '#2e7d32';
  } else {
    statoCoppiaSpan.textContent = '🔓 Lock Disattivato';
    statoCoppiaSpan.style.color = '#d32f2f';
  }
}

// Sincronizza gli slider dei giunti con gli angoli attuali (radianti)
function aggiornaSliderGiuntiDaAngoli(t1_rad: number, t2_rad: number) {
  const step1 = radToStep(t1_rad, OFFSET_BASE);
  const step2 = radToStep(t2_rad, OFFSET_GOMITO);

  if (sliderJ1) sliderJ1.value = step1.toString();
  if (labelJ1Step) labelJ1Step.textContent = step1.toString();
  if (labelJ1Gradi) labelJ1Gradi.textContent = `${radToDeg(t1_rad).toFixed(1)}°`;

  if (sliderJ2) sliderJ2.value = step2.toString();
  if (labelJ2Step) labelJ2Step.textContent = step2.toString();
  if (labelJ2Gradi) labelJ2Gradi.textContent = `${radToDeg(t2_rad).toFixed(1)}°`;
}

// Conversione da step encoder a radianti
function stepToRad(step: number, offsetStep: number = 2048): number {
  return ((step - offsetStep) / 4096) * (2 * Math.PI);
}

// Disegna il simulatore 2R
function disegnaSimulatore(targetX: number, targetY: number) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Griglia
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  for (let i = 0; i < canvas.width; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height);
    ctx.moveTo(0, i); ctx.lineTo(canvas.width, i);
    ctx.stroke();
  }

  // Assi cartesiani
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, CENTRO_Y); ctx.lineTo(canvas.width, CENTRO_Y);
  ctx.moveTo(CENTRO_X, 0); ctx.lineTo(CENTRO_X, canvas.height);
  ctx.stroke();

  // Area di lavoro
  const rMax = L1 + L2;
  const rMin = Math.abs(L1 - L2);

  ctx.strokeStyle = solCorrente.raggiungibile ? 'rgba(0, 255, 204, 0.25)' : 'rgba(255, 0, 0, 0.25)';
  ctx.fillStyle = 'rgba(0, 255, 204, 0.03)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(CENTRO_X, CENTRO_Y, rMax, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.fill();

  if (rMin > 5) {
    ctx.beginPath();
    ctx.arc(CENTRO_X, CENTRO_Y, rMin, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Snodi e bracci
  const x0 = CENTRO_X;
  const y0 = CENTRO_Y;

  const x1_mm = L1 * Math.cos(solCorrente.t1);
  const y1_mm = L1 * Math.sin(solCorrente.t1);
  const x1 = CENTRO_X + x1_mm;
  const y1 = CENTRO_Y - y1_mm;

  const posPunta = diretta(solCorrente.t1, solCorrente.t2);
  const x2 = CENTRO_X + posPunta.x;
  const y2 = CENTRO_Y - posPunta.y;

  // Braccio L1 (Arancione)
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.stroke();

  // Braccio L2 (Blu)
  ctx.strokeStyle = '#2196f3';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.stroke();

  // Punti
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x0, y0, 8, 0, 2 * Math.PI); ctx.fill();
  ctx.beginPath(); ctx.arc(x1, y1, 6, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#4caf50';
  ctx.beginPath(); ctx.arc(x2, y2, 5, 0, 2 * Math.PI); ctx.fill();

  // Target
  const targetCanvasX = CENTRO_X + targetX;
  const targetCanvasY = CENTRO_Y - targetY;
  ctx.strokeStyle = puntoFissato ? '#ff00ff' : (solCorrente.raggiungibile ? '#00ffcc' : '#f44336');
  ctx.lineWidth = puntoFissato ? 3 : 2;
  ctx.beginPath();
  ctx.arc(targetCanvasX, targetCanvasY, puntoFissato ? 10 : 8, 0, 2 * Math.PI);
  ctx.stroke();
}

// Invia dati ai motori fisici via RS485
async function aggiornaMotoriFisici(t1_rad: number, t2_rad: number) {
  if (!seriale.isConnesso()) return;

  const stepBase = radToStep(-t1_rad, OFFSET_BASE);
  const stepGomito = radToStep(t2_rad, OFFSET_GOMITO);

  try {
    // Unico pacchetto inviato a entrambi i motori nello stesso istante
    const pktSync = creaPacchettoSyncWrite2Servi(
      0x02, stepBase, 0,
      0x01, stepGomito, 0
    );
    
    await seriale.invia(pktSync);
  } catch (err: any) {
    console.error("Errore invio traiettoria hardware:", err.message);
  }
}

// --- INTERAZIONE MOUSE SU CANVAS ---
if (canvas) {
  canvas.addEventListener('click', () => {
    if (animazioneAttiva) return;
    puntoFissato = !puntoFissato;
    if (puntoFissato) {
      scriviLog(`📌 Punto fissato: X = ${targetX_corrente} mm, Y = ${targetY_corrente} mm.`);
    } else {
      scriviLog("🔓 Punto sbloccato. Target in ascolto del mouse.");
    }
    disegnaSimulatore(targetX_corrente, targetY_corrente);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (animazioneAttiva || puntoFissato) return;

    const rect = canvas.getBoundingClientRect();
    const mouseCanvasX = e.clientX - rect.left;
    const mouseCanvasY = e.clientY - rect.top;

    targetX_corrente = Math.round(mouseCanvasX - CENTRO_X);
    targetY_corrente = Math.round(CENTRO_Y - mouseCanvasY);

    solCorrente = inversa(targetX_corrente, targetY_corrente, gomitoCorrente);

    if (infoTarget) infoTarget.textContent = `Target: X = ${targetX_corrente} mm, Y = ${targetY_corrente} mm`;
    if (infoAngoli) infoAngoli.textContent = `θ1 = ${radToDeg(solCorrente.t1).toFixed(1)}°, θ2 = ${radToDeg(solCorrente.t2).toFixed(1)}°`;

    if (infoStato) {
      if (solCorrente.raggiungibile) {
        infoStato.textContent = 'RAGGIUNGIBILE';
        infoStato.style.color = '#4caf50';
      } else {
        infoStato.textContent = 'NON RAGGIUNGIBILE (SATURATO)';
        infoStato.style.color = '#f44336';
      }
    }

    disegnaSimulatore(targetX_corrente, targetY_corrente);
    aggiornaSliderGiuntiDaAngoli(solCorrente.t1, solCorrente.t2);

    if (chkLiveHardware && chkLiveHardware.checked) {
      aggiornaMotoriFisici(solCorrente.t1, solCorrente.t2);
    }
  });
}

// --- CONTROLLO SPAZIO GIUNTI (SLIDERS J1 & J2) ---
function gestisciMovimentoGiunti() {
  if (animazioneAttiva) return;

  const step1 = parseInt(sliderJ1.value, 10);
  const step2 = parseInt(sliderJ2.value, 10);

  const t1 = stepToRad(step1, OFFSET_BASE);
  const t2 = stepToRad(step2, OFFSET_GOMITO);

  solCorrente = { t1, t2, raggiungibile: true };

  // Calcolo Cinematica Diretta per trovare (X,Y) corrispondenti
  const posPunta = diretta(t1, t2);
  targetX_corrente = Math.round(posPunta.x);
  targetY_corrente = Math.round(posPunta.y);

  if (labelJ1Step) labelJ1Step.textContent = step1.toString();
  if (labelJ1Gradi) labelJ1Gradi.textContent = `${radToDeg(t1).toFixed(1)}°`;

  if (labelJ2Step) labelJ2Step.textContent = step2.toString();
  if (labelJ2Gradi) labelJ2Gradi.textContent = `${radToDeg(t2).toFixed(1)}°`;

  if (infoTarget) infoTarget.textContent = `Target: X = ${targetX_corrente} mm, Y = ${targetY_corrente} mm`;
  if (infoAngoli) infoAngoli.textContent = `θ1 = ${radToDeg(t1).toFixed(1)}°, θ2 = ${radToDeg(t2).toFixed(1)}°`;

  disegnaSimulatore(targetX_corrente, targetY_corrente);

  if (chkLiveHardware && chkLiveHardware.checked) {
    aggiornaMotoriFisici(t1, t2);
  }
}

if (sliderJ1) sliderJ1.addEventListener('input', gestisciMovimentoGiunti);
if (sliderJ2) sliderJ2.addEventListener('input', gestisciMovimentoGiunti);

// --- SPOSTAMENTO CARTESIANO MANUALE (X, Y) ---
if (btnSpostaCartesiano) {
  btnSpostaCartesiano.addEventListener('click', () => {
    const x = parseFloat(inputManualX.value);
    const y = parseFloat(inputManualY.value);

    targetX_corrente = x;
    targetY_corrente = y;

    solCorrente = inversa(x, y, gomitoCorrente);

    if (!solCorrente.raggiungibile) {
      scriviLog(`⚠️ Attenzione: Le coordinate [X=${x}, Y=${y}] sono fuori dall'area di lavoro!`);
    } else {
      scriviLog(`📍 Spostamento Cartesiano: X=${x} mm, Y=${y} mm -> θ1=${radToDeg(solCorrente.t1).toFixed(1)}°, θ2=${radToDeg(solCorrente.t2).toFixed(1)}°`);
    }

    if (infoTarget) infoTarget.textContent = `Target: X = ${x} mm, Y = ${y} mm`;
    if (infoAngoli) infoAngoli.textContent = `θ1 = ${radToDeg(solCorrente.t1).toFixed(1)}°, θ2 = ${radToDeg(solCorrente.t2).toFixed(1)}°`;

    disegnaSimulatore(x, y);
    aggiornaSliderGiuntiDaAngoli(solCorrente.t1, solCorrente.t2);

    if (chkLiveHardware && chkLiveHardware.checked) {
      aggiornaMotoriFisici(solCorrente.t1, solCorrente.t2);
    }
  });
}

// Invia Posizione Corrente su comando esplicito
if (btnInviaPos) {
  btnInviaPos.addEventListener('click', () => {
    if (!solCorrente.raggiungibile) {
      scriviLog("⚠️ Invio annullato: Posizione fuori dallo spazio di lavoro!");
      return;
    }
    scriviLog(`🚀 Invio Hardware: θ1 = ${radToDeg(solCorrente.t1).toFixed(1)}°, θ2 = ${radToDeg(solCorrente.t2).toFixed(1)}°`);
    aggiornaMotoriFisici(solCorrente.t1, solCorrente.t2);
  });
}

if (selectGomito) {
  selectGomito.addEventListener('change', () => {
    gomitoCorrente = parseInt(selectGomito.value, 10);
    solCorrente = inversa(targetX_corrente, targetY_corrente, gomitoCorrente);
    disegnaSimulatore(targetX_corrente, targetY_corrente);
    aggiornaSliderGiuntiDaAngoli(solCorrente.t1, solCorrente.t2);
  });
}

// Modalità Simulatore Offline
if (btnSimulazione) {
  btnSimulazione.addEventListener('click', () => {
    if (sezDisconnesso) sezDisconnesso.classList.add('nascosto');
    if (sezConnesso) sezConnesso.classList.remove('nascosto');
    if (statoCoppiaSpan) {
      statoCoppiaSpan.textContent = '🌐 Solo Simulatore (Offline)';
      statoCoppiaSpan.style.color = '#1565c0';
    }
    scriviLog("Modalità solo simulazione avviata.");
  });
}

// Inizializzazione grafica
solCorrente = inversa(200, 100, gomitoCorrente);
disegnaSimulatore(200, 100);
aggiornaSliderGiuntiDaAngoli(solCorrente.t1, solCorrente.t2);

// --- DECODIFICA RISPOSTE TELEMETRIA DUAL-SERVO ---
seriale.onPacchettoRicevuto = (pacchetto) => {
  scriviLog(`<- RX [ID ${pacchetto.id}] [${toHex(pacchetto.byteGrezzi)}]`);

  if (pacchetto.dati.length === 4) {
    const caricoGrezzo = decodifica16(pacchetto.dati[0], pacchetto.dati[1]);
    const caricoEffettivo = caricoGrezzo & 0x03FF;
    const temp = pacchetto.dati[3];

    if (pacchetto.id === 1) {
      tempServo1 = temp;
      if (labelCarico1) labelCarico1.textContent = `${caricoEffettivo}`;
      if (labelTemp1) labelTemp1.textContent = `${temp} °C`;
      const perc1 = Math.min(100, Math.round((caricoEffettivo / 1000) * 100));
      if (barraCarico1) barraCarico1.style.width = `${perc1}%`;
    } else if (pacchetto.id === 2) {
      tempServo2 = temp;
      if (labelCarico2) labelCarico2.textContent = `${caricoEffettivo}`;
      if (labelTemp2) labelTemp2.textContent = `${temp} °C`;
      const perc2 = Math.min(100, Math.round((caricoEffettivo / 1000) * 100));
      if (barraCarico2) barraCarico2.style.width = `${perc2}%`;
    }

    if (bloccoTelemetria) {
      if (tempServo1 >= SOGLIA_TEMPERATURA_CRITICA || tempServo2 >= SOGLIA_TEMPERATURA_CRITICA) {
        bloccoTelemetria.classList.add('allarme-temperatura');
      } else {
        bloccoTelemetria.classList.remove('allarme-temperatura');
      }
    }

    scriviLog(`   -> SERVO ${pacchetto.id} | CARICO: ${caricoEffettivo} | TEMP: ${temp} °C`);
  } else if (pacchetto.dati.length === 2) {
    const stepReali = decodifica16(pacchetto.dati[0], pacchetto.dati[1]);
    const gradiReali = stepInGradi(stepReali);
    scriviLog(`   -> SERVO ${pacchetto.id} POSIZIONE: ${gradiReali}° (${stepReali} step)`);
  } else if (pacchetto.dati.length === 1) {
    const valore = pacchetto.dati[0];
    if (ultimoRegistro1ByteRichiesto === 0x28) {
      aggiornaIconaLock(valore === 1);
      scriviLog(`   -> SERVO ${pacchetto.id} LOCK: ${valore === 1 ? 'Attivo' : 'Disattivato'}`);
    }
  }
};

// Richiesta telemetria a Entrambi i Servo (ID 1 e ID 2)
async function richiediTelemetria() {
  if (!seriale.isConnesso()) return;
  try {
    const p1 = creaPacchettoLettura(0x01, 0x3C, 4);
    await seriale.invia(p1);
    
    const p2 = creaPacchettoLettura(0x02, 0x3C, 4);
    await seriale.invia(p2);
  } catch (err: any) {
    scriviLog(`Errore telemetria: ${err.message}`);
  }
}

if (btnLeggiTelemetria) btnLeggiTelemetria.addEventListener('click', () => richiediTelemetria());

if (chkAutoTelemetria) {
  chkAutoTelemetria.addEventListener('change', () => {
    if (chkAutoTelemetria.checked) {
      timerTelemetria = window.setInterval(richiediTelemetria, 300);
    } else if (timerTelemetria !== null) {
      clearInterval(timerTelemetria);
      timerTelemetria = null;
    }
  });
}

if (btnConnetti) {
  btnConnetti.addEventListener('click', async () => {
    try {
      scriviLog("Apertura finestra di selezione porta...");
      await seriale.connetti();
      scriviLog("Porta aperta con successo a 1 Mbit/s.");

      if (sezDisconnesso) sezDisconnesso.classList.add('nascosto');
      if (sezConnesso) sezConnesso.classList.remove('nascosto');

      ultimoRegistro1ByteRichiesto = 0x28;
      await seriale.invia(creaPacchettoLettura(0x01, 0x28, 1));
    } catch (err: any) {
      scriviLog(`Errore di connessione: ${err.message}`);
    }
  });
}

// Diagnostic Ping / Position
if (btnPing1) {
  btnPing1.addEventListener('click', async () => {
    if (!seriale.isConnesso()) return;
    try { await seriale.invia(creaPacchetto(0x01, 0x01)); } catch (err: any) { scriviLog(`Errore Ping 1: ${err.message}`); }
  });
}

if (btnPing2) {
  btnPing2.addEventListener('click', async () => {
    if (!seriale.isConnesso()) return;
    try { await seriale.invia(creaPacchetto(0x02, 0x01)); } catch (err: any) { scriviLog(`Errore Ping 2: ${err.message}`); }
  });
}

if (btnLeggiPos1) {
  btnLeggiPos1.addEventListener('click', async () => {
    if (!seriale.isConnesso()) return;
    try { await seriale.invia(creaPacchettoLettura(0x01, 0x38, 2)); } catch (err: any) { scriviLog(`Errore Pos 1: ${err.message}`); }
  });
}

if (btnLeggiPos2) {
  btnLeggiPos2.addEventListener('click', async () => {
    if (!seriale.isConnesso()) return;
    try { await seriale.invia(creaPacchettoLettura(0x02, 0x38, 2)); } catch (err: any) { scriviLog(`Errore Pos 2: ${err.message}`); }
  });
}

if (btnDisconnetti) {
  btnDisconnetti.addEventListener('click', async () => {
    try {
      if (timerTelemetria !== null) {
        clearInterval(timerTelemetria);
        timerTelemetria = null;
        if (chkAutoTelemetria) chkAutoTelemetria.checked = false;
      }
      if (statoCoppiaSpan) {
        statoCoppiaSpan.textContent = '🔒 Stato: Sconosciuto';
        statoCoppiaSpan.style.color = 'inherit';
      }
      if (seriale.isConnesso()) {
        await seriale.disconnetti();
        scriviLog("Porta seriale chiusa.");
      }
      if (sezConnesso) sezConnesso.classList.add('nascosto');
      if (sezDisconnesso) sezDisconnesso.classList.remove('nascosto');
    } catch (err: any) {
      scriviLog(`Errore disconnessione: ${err.message}`);
    }
  });
}

// Lock / Torque Controls
if (btnCoppiaOn) {
  btnCoppiaOn.addEventListener('click', async () => {
    if (!seriale.isConnesso()) return;
    try {
      await seriale.invia(creaPacchettoScrittura8(0x01, 0x28, 1));
      await seriale.invia(creaPacchettoScrittura8(0x02, 0x28, 1));
      scriviLog(`-> TX (Abilita Lock Servo 1 e Servo 2)`);
      aggiornaIconaLock(true);
    } catch (err: any) { scriviLog(`Errore: ${err.message}`); }
  });
}

if (btnCoppiaOff) {
  btnCoppiaOff.addEventListener('click', async () => {
    if (!seriale.isConnesso()) return;
    try {
      await seriale.invia(creaPacchettoScrittura8(0x01, 0x28, 0));
      await seriale.invia(creaPacchettoScrittura8(0x02, 0x28, 0));
      scriviLog(`-> TX (Disabilita Lock Servo 1 e Servo 2)`);
      aggiornaIconaLock(false);
    } catch (err: any) { scriviLog(`Errore: ${err.message}`); }
  });
}

// --- MATEMATICA E AUTOMAZIONE TRAIETTORIA ---
function raccordo(t: number): number {
  return t * t * (3 - 2 * t);
}

function puntoDelCerchio(cx: number, cy: number, raggio: number, s: number) {
  const a = 2 * Math.PI * s;
  return {
    x: cx + raggio * Math.cos(a),
    y: cy + raggio * Math.sin(a),
  };
}

if (btnAvviaCerchio) {
  btnAvviaCerchio.addEventListener('click', () => {
    if (animazioneAttiva) return;
    animazioneAttiva = true;

    const cx = parseFloat(inputCx.value);
    const cy = parseFloat(inputCy.value);
    const raggio = parseFloat(inputRaggio.value);
    const durataMs = parseFloat(inputDurata.value) * 1000;

    const inizio = performance.now(); 
    scriviLog(`Avvio traiettoria: Cerchio (R=${raggio}mm, C=[${cx},${cy}]) in ${durataMs/1000}s`);

    const timerAnimazione = setInterval(() => {
      const adesso = performance.now();
      let t = (adesso - inizio) / durataMs;

      if (t >= 1) {
        t = 1;
        clearInterval(timerAnimazione);
        animazioneAttiva = false;
        scriviLog("Traiettoria completata.");
      }

      const s = raccordo(t);
      const p = puntoDelCerchio(cx, cy, raggio, s);

      targetX_corrente = p.x;
      targetY_corrente = p.y;
      solCorrente = inversa(p.x, p.y, gomitoCorrente);

      if (infoTarget) infoTarget.textContent = `Target: X = ${Math.round(p.x)} mm, Y = ${Math.round(p.y)} mm`;
      if (infoAngoli) infoAngoli.textContent = `θ1 = ${radToDeg(solCorrente.t1).toFixed(1)}°, θ2 = ${radToDeg(solCorrente.t2).toFixed(1)}°`;
      
      disegnaSimulatore(p.x, p.y);
      aggiornaSliderGiuntiDaAngoli(solCorrente.t1, solCorrente.t2);
      aggiornaMotoriFisici(solCorrente.t1, solCorrente.t2);      
    }, 20); 
  });
}