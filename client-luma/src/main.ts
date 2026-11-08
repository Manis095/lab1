const wsUrl = 'ws://lamp.local/bus';
let ws: WebSocket | null = null;
let prossimoIdRichiesta = 1;

// Profilo di sicurezza per il braccio 2R (Base ID 1, Gomito ID 2)
const profilo2R = {
  name: "lamp",
  pollMs: 20,
  linkTimeoutMs: 3500,
  servos: [
    {
      id: 1,
      mode: "position",
      min: 0,
      max: 4095,
      guard: { loadPermille: 813, currentUnits: 225, tempC: 60, holdMs: 600 }
    },
    {
      id: 2,
      mode: "position",
      min: 0,
      max: 4095,
      guard: { loadPermille: 813, currentUnits: 225, tempC: 60, holdMs: 600 }
    }
  ]
};

const logDiv = document.getElementById('log') as HTMLDivElement;

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
  };

  let contatoreTelemetria = 0;

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
    // I dati binari (TELEMETRIA) arrivano ogni 20ms.
    // Incrementiamo solo un contatore interno senza intasare la UI con scriviLog.
    contatoreTelemetria++;
  }
};

  ws.onclose = (ev) => {
    scriviLog(`Connessione chiusa (Codice: ${ev.code}).`);
  };

  ws.onerror = () => {
    scriviLog("Errore WebSocket.");
  };
}

// Listener per i pulsanti di controllo
document.getElementById('btn-status')?.addEventListener('click', () => inviaComandoJSON("status"));
document.getElementById('btn-scan')?.addEventListener('click', () => inviaComandoJSON("scan", { from: 1, to: 10 }));
document.getElementById('btn-config')?.addEventListener('click', () => inviaComandoJSON("config.set", { profile: profilo2R }));
document.getElementById('btn-arm')?.addEventListener('click', () => inviaComandoJSON("arm"));
document.getElementById('btn-disarm')?.addEventListener('click', () => inviaComandoJSON("disarm"));

// Avvio connessione
connettiBridge();