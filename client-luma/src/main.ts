import { analizzaTelemetria, creaFrameTxn, type StatoMotore } from './protocollo-luma';
import { L1, L2, inversa, radToStep, diretta } from './cinematica';
import { creaPacchettoSyncWrite2Servi } from './protocollo';
import { stepInGradi } from './protocollo';

let seqCorrente = 0;

const wsUrl = 'ws://lamp.local/bus';
let ws: WebSocket | null = null;
let prossimoIdRichiesta = 1;

let ultimoInvioMs = 0;
let loopFisicoAttivo = false;
let loopTimer: number | null = null;
let chkLiveHardware = false;

const logDiv = document.getElementById('log') as HTMLDivElement;

const profilo2R = {
  name: "lamp",
  pollMs: 20,
  linkTimeoutMs: 3500,
  servos: [
    {
      id: 1, // BASE (Giunto 1)
      mode: "position",
      min: 0,
      max: 4095,
      guard: { loadPermille: 813, currentUnits: 225, tempC: 60, holdMs: 600 }
    },
    {
      id: 2, // GOMITO (Giunto 2)
      mode: "position",
      min: 0,
      max: 4095,
      guard: { loadPermille: 813, currentUnits: 225, tempC: 60, holdMs: 600 }
    }
  ]
};

function scriviLog(msg: string) {
  if (!logDiv) return;
  const time = new Date().toLocaleTimeString();
  logDiv.textContent += `\n[${time}] ${msg}`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

function inviaComandoJSON(cmd: string, extraArgs: Record<string, any> = {}): number {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    scriviLog("Impossibile inviare: WebSocket non connesso.");
    return -1;
  }
  const id = prossimoIdRichiesta++;
  const payload = { cmd, id, ...extraArgs };
  scriviLog(`TX JSON: ${JSON.stringify(payload)}`);
  ws.send(JSON.stringify(payload));
  return id;
}

function connettiBridge() {
  scriviLog(`Connessione a ${wsUrl}...`);
  ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer'; 

  ws.onopen = () => {
    scriviLog("WebSocket Aperto! Connesso all'ESP32.");
    inviaComandoJSON("status");
    avviaLoop();
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const msg = JSON.parse(ev.data);
      scriviLog(`RX JSON: ${JSON.stringify(msg)}`);
      if (msg.cmd === "status" || msg.protocol === 8) {
        scriviLog(`Stato bridge: ${msg.state} | Watchdog parked: ${msg.parked}`);
      }
      if (msg.event) {
        scriviLog(`EVENTO SPONTANEO: ${msg.event}`);
      }
    } else {
      const buffer = ev.data as ArrayBuffer;
      const view = new DataView(buffer);
      const type = view.getUint8(0);

      if (type === 0x03) {
        const payload = new Uint8Array(buffer, 4);
        const statoMotori = analizzaTelemetria(payload);
        aggiornaInterfacciaTelemetria(statoMotori);
      }
    }
  };

  ws.onclose = (ev) => scriviLog(`Connessione chiusa (Codice: ${ev.code}).`);
  ws.onerror = () => scriviLog("Errore WebSocket.");
}

document.getElementById('btn-status')?.addEventListener('click', () => inviaComandoJSON("status"));
document.getElementById('btn-scan')?.addEventListener('click', () => inviaComandoJSON("scan", { from: 1, to: 10 }));
document.getElementById('btn-config')?.addEventListener('click', () => inviaComandoJSON("config.set", { profile: profilo2R }));
document.getElementById('btn-arm')?.addEventListener('click', () => inviaComandoJSON("arm"));
document.getElementById('btn-disarm')?.addEventListener('click', () => inviaComandoJSON("disarm"));

connettiBridge();

const canvas = document.getElementById('simulatore-canvas') as HTMLCanvasElement;
const ctx = canvas?.getContext('2d');
const centroX = 400; 
const centroY = 400; 

let ultimoStep1 = -1;
let ultimoStep2 = -1;

function disegnaBraccio(stepBase: number, stepGomito: number) {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // NOTA: Ripristinata l'inversione della base (ID1) usata nel vecchio codice[cite: 6]
  const t1Rad = -((stepBase - 2048) / 4096) * (2 * Math.PI);
  const t2Rad = ((stepGomito - 2048) / 4096) * (2 * Math.PI);

  const j1x = L1 * Math.cos(t1Rad);
  const j1y = L1 * Math.sin(t1Rad);
  const j2x = j1x + L2 * Math.cos(t1Rad + t2Rad);
  const j2y = j1y + L2 * Math.sin(t1Rad + t2Rad);

  const x0 = centroX;
  const y0 = centroY;
  const x1 = centroX + j1x;
  const y1 = centroY - j1y;
  const x2 = centroX + j2x;
  const y2 = centroY - j2y;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#ff9800';
  ctx.beginPath(); ctx.arc(x0, y0, 6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x1, y1, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f44336';
  ctx.beginPath(); ctx.arc(x2, y2, 6, 0, Math.PI * 2); ctx.fill();
}

function gestisciInputMouse(e: MouseEvent) {
  if (!chkLiveHardware || !canvas) return;
  
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left - centroX;
  const mouseY = centroY - (e.clientY - rect.top);

  const sol = inversa(mouseX, mouseY, 1);
  if (sol.raggiungibile) {
    const slider1 = document.getElementById('slider-j1') as HTMLInputElement;
    const slider2 = document.getElementById('slider-j2') as HTMLInputElement;
    
    // Invertito il calcolo del radiante per il giunto 1 in scrittura, come nel vecchio codice[cite: 6]
    if (slider1) slider1.value = radToStep(-sol.t1).toString();
    if (slider2) slider2.value = radToStep(sol.t2).toString();

    const infoTarget = document.getElementById('info-target');
    const infoAngoli = document.getElementById('info-angoli');
    if (infoTarget) infoTarget.textContent = `Target: X = ${mouseX.toFixed(0)} mm, Y = ${mouseY.toFixed(0)} mm`;
    if (infoAngoli) infoAngoli.textContent = `θ1 = ${(sol.t1 * 180 / Math.PI).toFixed(1)}°, θ2 = ${(sol.t2 * 180 / Math.PI).toFixed(1)}°`;
  }
}

canvas?.addEventListener('mousedown', gestisciInputMouse);
canvas?.addEventListener('mousemove', (e) => {
  if (e.buttons === 1) gestisciInputMouse(e);
});

function loopCinematico() {
  const ora = performance.now();
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (chkLiveHardware) {
      const slider1 = document.getElementById('slider-j1') as HTMLInputElement;
      const slider2 = document.getElementById('slider-j2') as HTMLInputElement;
      
      const stepBase = slider1 ? parseInt(slider1.value, 10) : 2048;
      const stepGomito = slider2 ? parseInt(slider2.value, 10) : 2048;
      
      if (stepBase !== ultimoStep1 || stepGomito !== ultimoStep2) {
        if (ora - ultimoInvioMs >= 20) {
          /* ID 2 per la Base (stepBase), ID 1 per il Gomito (stepGomito) */
          const payloadSts = creaPacchettoSyncWrite2Servi(2, stepBase, 0, 1, stepGomito, 0);
          inviaMovimentoBinario(payloadSts);
          ultimoStep1 = stepBase;
          ultimoStep2 = stepGomito;
          ultimoInvioMs = ora;
        }
      } else if (ora - ultimoInvioMs > 1000) {
        inviaMovimentoBinario(new Uint8Array(0));
        ultimoInvioMs = ora;
      }
      
      disegnaBraccio(stepBase, stepGomito);
      
    } else {
      if (ora - ultimoInvioMs > 1000) {
        inviaMovimentoBinario(new Uint8Array(0));
        ultimoInvioMs = ora;
      }
    }
  }
  
  loopTimer = requestAnimationFrame(loopCinematico);
}

export function avviaLoop() {
  if (!loopFisicoAttivo) {
    loopFisicoAttivo = true;
    ultimoInvioMs = performance.now();
    loopTimer = requestAnimationFrame(loopCinematico);
  }
}

function inviaMovimentoBinario(payloadSts: Uint8Array) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const frame = creaFrameTxn(seqCorrente, payloadSts);
  seqCorrente = (seqCorrente + 1) & 0xFFFF;
  ws.send(frame.buffer as ArrayBuffer);
}

function aggiornaInterfacciaTelemetria(motori: StatoMotore[]) {
  for (const m of motori) {
    const step = m.posizione;
    const gradi = stepInGradi(step); 
    const caricoPerc = Math.min(100, (m.carico / 1000) * 100); 

    /* Servo ID 2 corrisponde al Giunto 1 (Base) */
    if (m.id === 2) {
      document.getElementById('label-j1-step')!.textContent = step.toString();
      document.getElementById('label-j1-gradi')!.textContent = `${gradi}°`;
      document.getElementById('label-carico-1')!.textContent = m.carico.toString();
      document.getElementById('label-temp-1')!.textContent = `${m.temperatura} °C`;
      document.getElementById('barra-carico-1')!.style.width = `${caricoPerc}%`;
      
      const slider = document.getElementById('slider-j1') as HTMLInputElement;
      if (slider && !chkLiveHardware) slider.value = step.toString();
    
    /* Servo ID 1 corrisponde al Giunto 2 (Gomito) */
    } else if (m.id === 1) {
      document.getElementById('label-j2-step')!.textContent = step.toString();
      document.getElementById('label-j2-gradi')!.textContent = `${gradi}°`;
      document.getElementById('label-carico-2')!.textContent = m.carico.toString();
      document.getElementById('label-temp-2')!.textContent = `${m.temperatura} °C`;
      document.getElementById('barra-carico-2')!.style.width = `${caricoPerc}%`;
      
      const slider = document.getElementById('slider-j2') as HTMLInputElement;
      if (slider && !chkLiveHardware) slider.value = step.toString();
    }
  }
}

const chkLive = document.getElementById('chk-live-hardware') as HTMLInputElement;
if (chkLive) {
  chkLive.addEventListener('change', (e) => {
    chkLiveHardware = (e.target as HTMLInputElement).checked;
  });
}