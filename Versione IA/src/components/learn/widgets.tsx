import { useState } from 'react'
import { checksumWorkout } from '../../learn/anatomy'
import type { WidgetId } from '../../learn/content'
import { fromHex } from '../../learn/exchanges'
import { PacketParser } from '../../serial/parser'
import { fromLE16, toHex } from '../../serial/protocol'
import { clampPosition, decodeLoad, POSITION_MAX } from '../../serial/registers'
import { latestExchange, useExchanges } from '../appContext'
import { PacketView } from '../PacketView'
import { SourceNote, TagChip } from './TagChip'

const hex2 = (b: number) => b.toString(16).toUpperCase().padStart(2, '0')
const bin8 = (b: number) => b.toString(2).padStart(8, '0')

export function LearnWidget({ id }: { id: WidgetId }) {
  switch (id) {
    case 'architecture':
      return <ArchitectureWidget />
    case 'packetFormat':
      return <PacketFormatWidget />
    case 'checksum':
      return <ChecksumWidget />
    case 'littleEndian':
      return <LittleEndianWidget />
    case 'parserStepper':
      return <ParserStepperWidget />
    case 'loadDecode':
      return <LoadDecodeWidget />
    case 'sequenceFlow':
      return <SequenceFlowWidget />
  }
}

// ---- Architettura -----------------------------------------------------------

const LAYERS = [
  { name: 'Interfaccia', files: 'App.tsx, components/', note: 'mostra e raccoglie i clic' },
  { name: 'Servo e sequenza', files: 'serial/servo.ts, serial/sequence.ts', note: '"vai a", "dove sei", tappe' },
  { name: 'Connessione', files: 'serial/connection.ts', note: 'coda, timeout, chiusura, blocco scritture' },
  { name: 'Parser e protocollo', files: 'serial/parser.ts, serial/protocol.ts', note: 'byte ⇄ pacchetti' },
  { name: 'Web Serial API', files: 'navigator.serial', note: 'fornita dal browser' },
  { name: 'Adattatore USB', files: 'porta seriale virtuale', note: 'USB ⇄ UART 1 Mbaud' },
  { name: 'Servo STS, ID 1', files: 'bus half duplex a un filo', note: 'risponde solo se interrogato' },
]

function ArchitectureWidget() {
  return (
    <ol className="widget layers">
      {LAYERS.map((layer, i) => (
        <li key={layer.name} className={i < 4 ? 'layer-code' : 'layer-hw'}>
          <strong>{layer.name}</strong>
          <code>{layer.files}</code>
          <span className="note">{layer.note}</span>
        </li>
      ))}
    </ol>
  )
}

// ---- Formato del pacchetto --------------------------------------------------

const EXAMPLE_PING_TX = fromHex('FF FF 01 02 01 FB')
const EXAMPLE_PING_RX = fromHex('FF FF 01 02 00 FC')

function PacketFormatWidget() {
  const exchanges = useExchanges()
  const real = exchanges.ping ?? latestExchange(exchanges)
  return (
    <div className="widget">
      <SourceNote time={real?.txTime ?? null} what="ultimo scambio" />
      <PacketView packet={real?.tx ?? EXAMPLE_PING_TX} direction="TX" />
      {(real ? real.rx : EXAMPLE_PING_RX) && (
        <PacketView packet={real ? real.rx! : EXAMPLE_PING_RX} direction="RX" />
      )}
    </div>
  )
}

// ---- Checksum ---------------------------------------------------------------

function ChecksumWidget() {
  const real = latestExchange(useExchanges())
  const packet = real?.tx ?? EXAMPLE_PING_TX
  const w = checksumWorkout(packet)
  return (
    <div className="widget">
      <SourceNote time={real?.txTime ?? null} what="ultimo TX" />
      <PacketView packet={packet} direction="TX" compact />
      <div className="table-wrap">
        <table className="workout">
          <thead>
            <tr>
              <th>Byte</th>
              <th>Esadecimale</th>
              <th>Decimale</th>
              <th>Somma progressiva</th>
            </tr>
          </thead>
          <tbody>
            {w.steps.map((s) => (
              <tr key={s.index}>
                <td>{s.index}</td>
                <td>
                  <code>{hex2(s.value)}</code>
                </td>
                <td>{s.value}</td>
                <td>{s.sum}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="workout-steps">
        <li>
          Somma: <strong>{w.sum}</strong>; modulo 256: <strong>{w.sumMod256}</strong> ={' '}
          <code>{hex2(w.sumMod256)}</code> = <code>{bin8(w.sumMod256)}</code>
        </li>
        <li>
          Complemento a uno (ogni bit invertito): <code>{bin8(w.complement)}</code> ={' '}
          <code>{hex2(w.complement)}</code>
        </li>
        <li>
          Nel pacchetto c'è <code>{w.received !== null ? hex2(w.received) : '?'}</code>:{' '}
          {w.ok ? (
            <span className="badge ok">coincide</span>
          ) : (
            <span className="badge alarm">non coincide</span>
          )}
        </li>
      </ol>
    </div>
  )
}

// ---- Little endian ----------------------------------------------------------

function LittleEndianWidget() {
  const goal = useExchanges().goal
  const realValue = goal && goal.tx.length === 9 ? fromLE16(goal.tx, 6) : null
  const [custom, setCustom] = useState<string | null>(null)
  const value = custom !== null ? clampPosition(Number(custom)) : (realValue ?? 3000)
  const low = value & 0xff
  const high = value >> 8
  const swapped = (low << 8) | high

  return (
    <div className="widget">
      {custom === null ? (
        <SourceNote time={realValue !== null ? goal!.txTime : null} what="ultima posizione obiettivo inviata" />
      ) : (
        <p className="source">Valore scelto da te.</p>
      )}
      <div className="row">
        <label htmlFor="le-value">Prova un valore</label>
        <input
          id="le-value"
          type="number"
          min={0}
          max={POSITION_MAX}
          value={custom ?? String(value)}
          onChange={(e) => setCustom(e.target.value)}
        />
      </div>
      <div className="le-grid">
        <div>
          <span className="note">Decimale</span>
          <strong>{value}</strong>
        </div>
        <div>
          <span className="note">Esadecimale</span>
          <strong>
            0x<span className="le-high">{hex2(high)}</span>
            <span className="le-low">{hex2(low)}</span>
          </strong>
        </div>
        <div>
          <span className="note">Ordine sul filo</span>
          <strong>
            <span className="byte-inline le-low">{hex2(low)} basso</span>{' '}
            <span className="byte-inline le-high">{hex2(high)} alto</span>
          </strong>
        </div>
      </div>
      <p>
        Controprova: {low} + {high} × 256 = <strong>{low + high * 256}</strong>.
      </p>
      <p>
        Con i byte invertiti il servo leggerebbe <code>0x{hex2(low)}{hex2(high)}</code> ={' '}
        <strong>{swapped}</strong>
        {swapped > POSITION_MAX ? (
          <>
            , oltre {POSITION_MAX}: satura e va a fine corsa. <TagChip tag="lezione" />
          </>
        ) : swapped === value ? (
          ': uguale, perché i due byte coincidono.'
        ) : (
          ': una posizione diversa, senza nessun errore segnalato.'
        )}
      </p>
    </div>
  )
}

// ---- Parser passo passo -----------------------------------------------------

interface Scenario {
  name: string
  chunks: string[]
}

// Gli stessi casi dei test unitari del parser.
const SCENARIOS: Scenario[] = [
  { name: 'Pacchetto in tre pezzi', chunks: ['FF FF 01', '02 01', 'FB FF FF'] },
  { name: 'Due pacchetti in un blocco', chunks: ['FF FF 01 02 00 FC FF FF 01 04 00 F4 0B FB'] },
  { name: 'Byte spazzatura davanti', chunks: ['00 13 FF 7A FF FF 01 02 00 FC'] },
  { name: 'Checksum sbagliato, poi pacchetto valido', chunks: ['FF FF 01 02 00 00 FF FF 02 02 00 FB'] },
]

interface ParserFrame {
  chunk: Uint8Array
  packets: Uint8Array[]
  pending: Uint8Array
  discarded: number
}

/** Riesegue il parser vero sui primi `count` pezzi. */
function replay(scenario: Scenario, count: number): ParserFrame[] {
  const parser = new PacketParser()
  const frames: ParserFrame[] = []
  for (const text of scenario.chunks.slice(0, count)) {
    const before = parser.discardedBytes
    const chunk = fromHex(text)
    const packets = parser.feed(chunk)
    frames.push({ chunk, packets, pending: parser.pending, discarded: parser.discardedBytes - before })
  }
  return frames
}

function explainFrame(frame: ParserFrame): string {
  const parts: string[] = []
  if (frame.discarded > 0) {
    parts.push(`scartati ${frame.discarded} byte uno alla volta per ritrovare un inizio FF FF con checksum valido`)
  }
  if (frame.packets.length > 0) {
    parts.push(`estratti ${frame.packets.length} pacchetti completi con checksum corretto`)
  }
  const p = frame.pending
  if (p.length === 0) parts.push('buffer vuoto')
  else if (p.length < 4) parts.push(`restano ${p.length} byte: meno di 4, aspetto il prossimo pezzo`)
  else parts.push(`LEN dice ${4 + p[3]} byte in tutto, ne ho ${p.length}: aspetto il resto`)
  const text = parts.join('; ')
  return text.charAt(0).toUpperCase() + text.slice(1) + '.'
}

function ParserStepperWidget() {
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [count, setCount] = useState(0)
  const scenario = SCENARIOS[scenarioIndex]
  const frames = replay(scenario, count)
  const last = frames.at(-1)
  const done = count >= scenario.chunks.length

  return (
    <div className="widget">
      <p className="source">
        Esempio statico, non collegato alla porta: usa il PacketParser vero sugli stessi byte dei test.
      </p>
      <div className="row">
        <label htmlFor="parser-scenario">Caso</label>
        <select
          id="parser-scenario"
          value={scenarioIndex}
          onChange={(e) => {
            setScenarioIndex(Number(e.target.value))
            setCount(0)
          }}
        >
          {SCENARIOS.map((s, i) => (
            <option key={s.name} value={i}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <ol className="chunks">
        {scenario.chunks.map((c, i) => (
          <li key={i} className={i < count ? 'chunk-done' : i === count ? 'chunk-next' : ''}>
            <span className="note">read() n. {i + 1}</span> <code>{c}</code>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="primary" onClick={() => setCount((n) => n + 1)} disabled={done}>
          Prossimo pezzo
        </button>
        <button type="button" onClick={() => setCount(0)} disabled={count === 0}>
          Ricomincia
        </button>
      </div>
      {last ? (
        <div className="parser-state">
          <p>
            <strong>Dopo il pezzo {count}:</strong> {explainFrame(last)}
          </p>
          <p className="buffer">
            Buffer: {last.pending.length > 0 ? <code>{toHex(last.pending)}</code> : <span className="note">vuoto</span>}
          </p>
          {frames.flatMap((f) => f.packets).map((packet, i) => (
            <PacketView key={i} packet={packet} direction={packet[4] === 0 ? 'RX' : 'TX'} compact />
          ))}
        </div>
      ) : (
        <p className="note">Premi "Prossimo pezzo" per consegnare al parser il primo blocco di byte.</p>
      )}
    </div>
  )
}

// ---- Decodifica del carico --------------------------------------------------

const EXAMPLE_LOAD_RAW = 1024 + 300

function LoadDecodeWidget() {
  const telemetry = useExchanges().telemetry
  const rx = telemetry?.rx
  const raw = rx && rx.length >= 8 ? fromLE16(rx, 5) : null
  const value = raw ?? EXAMPLE_LOAD_RAW
  const load = decodeLoad(value)
  const bits = value.toString(2).padStart(16, '0').split('')

  return (
    <div className="widget">
      <SourceNote time={raw !== null ? telemetry!.rxTime : null} what="ultima lettura del monitor" />
      <p>
        Valore grezzo del registro 60: <strong>{value}</strong> = <code>0x{value.toString(16).toUpperCase().padStart(4, '0')}</code>
      </p>
      <div className="bits" aria-label="Bit dal 15 allo 0">
        {bits.map((bit, i) => {
          const n = 15 - i
          const group = n > 10 ? 'bits-unused' : n === 10 ? 'bits-dir' : 'bits-value'
          return (
            <span key={n} className={`bit ${group}`}>
              <span className="bit-value">{bit}</span>
              <span className="bit-index">{n}</span>
            </span>
          )
        })}
      </div>
      <ul className="bits-legend">
        <li>
          <span className="bit-key bits-value">bit 0..9</span> valore: {load.value} → {load.percent.toLocaleString('it-IT')}% (
          {value} & 0x3FF)
        </li>
        <li>
          <span className="bit-key bits-dir">bit 10</span> direzione: {load.direction} ((raw &gt;&gt; 10) & 1)
        </li>
        <li>
          <span className="bit-key bits-unused">bit 11..15</span> attesi a 0
          {!load.plausible && <span className="badge alarm">formato non plausibile</span>}
        </li>
      </ul>
      <p>
        <TagChip tag="verificare" /> Formato da tabella di terze parti.
      </p>
    </div>
  )
}

// ---- Diagramma della sequenza -----------------------------------------------

function SequenceFlowWidget() {
  return (
    <div className="widget flow-wrap">
      <svg className="flow" viewBox="0 0 560 470" role="img" aria-label="Diagramma di flusso di una tappa della sequenza">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="flow-arrowhead" />
          </marker>
        </defs>
        <g className="flow-lines" markerEnd="url(#arrow)">
          <line x1="200" y1="56" x2="200" y2="84" />
          <line x1="200" y1="126" x2="200" y2="154" />
          <line x1="200" y1="196" x2="200" y2="222" />
          <line x1="200" y1="302" x2="200" y2="404" />
          <line x1="262" y1="262" x2="340" y2="262" />
          <line x1="420" y1="302" x2="420" y2="334" />
          <polyline points="420,376 420,426 282,426" fill="none" />
          <polyline points="500,262 540,262 540,105 282,105" fill="none" />
        </g>
        <g className="flow-boxes">
          <rect x="100" y="16" width="200" height="40" rx="6" />
          <rect x="120" y="86" width="160" height="40" rx="6" />
          <rect x="100" y="156" width="200" height="40" rx="6" />
          <polygon points="200,224 262,262 200,300 138,262" />
          <polygon points="420,224 500,262 420,300 340,262" />
          <rect x="340" y="336" width="160" height="40" rx="6" className="flow-warn" />
          <rect x="120" y="406" width="160" height="40" rx="6" className="flow-ok" />
        </g>
        <g className="flow-text">
          <text x="200" y="41">Scrivi obiettivo (reg. 42)</text>
          <text x="200" y="111">Attendi 50 ms</text>
          <text x="200" y="181">Leggi posizione (reg. 56)</text>
          <text x="200" y="267">Entro ±2?</text>
          <text x="420" y="267">Passati 3 s?</text>
          <text x="420" y="361">Segna "non arrivato"</text>
          <text x="200" y="431">Tappa successiva</text>
          <text x="214" y="360" className="flow-label">sì</text>
          <text x="300" y="254" className="flow-label">no</text>
          <text x="434" y="322" className="flow-label">sì</text>
          <text x="520" y="252" className="flow-label">no</text>
        </g>
      </svg>
      <p className="note">
        <TagChip tag="confermato" /> In qualsiasi punto, Ferma interrompe l'attesa e il ciclo esce senza inviare
        altri comandi.
      </p>
    </div>
  )
}
