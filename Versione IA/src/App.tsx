import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppContext, type AppContextValue, responseStatus, type StepNumber } from './components/appContext'
import { ConnectPanel } from './components/ConnectPanel'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { LearnDrawer } from './components/learn/LearnDrawer'
import { type LogCounts, type LogEntry, LogPanel } from './components/LogPanel'
import { MonitorPanel } from './components/MonitorPanel'
import { PositionPanel } from './components/PositionPanel'
import { ProgressNav } from './components/ProgressNav'
import { SequencePanel } from './components/SequencePanel'
import { ThemeToggle } from './components/ThemeToggle'
import type { TopicId } from './learn/content'
import { applyTraffic, type ExchangeKey, type ExchangeMap } from './learn/exchanges'
import { SerialConnection } from './serial/connection'
import { Servo } from './serial/servo'

const MAX_LOG_ENTRIES = 400

let logSeq = 0

const NO_COUNTS: LogCounts = { tx: 0, rx: 0, alarms: 0, timeouts: 0 }

/** Aggiorna i contatori del log con un evento. */
function count(prev: LogCounts, event: { kind: string; text: string; alarm: boolean }): LogCounts {
  if (event.kind === 'TX') return { ...prev, tx: prev.tx + 1 }
  if (event.kind === 'RX') return { ...prev, rx: prev.rx + 1, alarms: prev.alarms + (event.alarm ? 1 : 0) }
  // Il testo del timeout viene da SerialConnection ("Nessuna risposta entro ...").
  if (/^Nessuna risposta/.test(event.text)) return { ...prev, timeouts: prev.timeouts + 1 }
  return prev
}

interface ExchangeState {
  map: ExchangeMap
  current: ExchangeKey | null
}

export default function App() {
  // Una connessione per tutta la vita del componente; si apre solo da clic.
  const [connection] = useState(() => new SerialConnection())
  const [servo] = useState(() => new Servo(connection))
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [exchanges, setExchanges] = useState<ExchangeState>({ map: {}, current: null })
  const [learnTopic, setLearnTopic] = useState<TopicId | null>(null)
  const [counts, setCounts] = useState<LogCounts>(NO_COUNTS)
  const [sequenceDone, setSequenceDone] = useState(false)

  useEffect(() => {
    const offTraffic = connection.onTraffic((event) => {
      setLog((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), { ...event, seq: logSeq++ }])
      setExchanges((prev) => applyTraffic(prev.map, prev.current, event))
      setCounts((prev) => count(prev, event))
    })
    const offState = connection.onConnectionChange(setConnected)
    return () => {
      offTraffic()
      offState()
      // In StrictMode (sviluppo) e nel ricaricamento a caldo il cleanup chiude la porta.
      void connection.disconnect()
    }
  }, [connection])

  const markStepDone = useCallback((step: StepNumber) => {
    if (step === 4) setSequenceDone(true)
  }, [])

  const context = useMemo<AppContextValue>(
    () => ({ exchanges: exchanges.map, openLearn: setLearnTopic, markStepDone }),
    [exchanges.map, markStepDone],
  )

  // Avanzamento dedotto dal traffico: un passo è fatto quando il servo ha risposto con stato 00.
  const answeredOk = (key: keyof typeof exchanges.map) =>
    exchanges.map[key]?.state === 'answered' && responseStatus(exchanges.map[key]) === 0
  const done: Record<StepNumber, boolean> = {
    1: answeredOk('ping'),
    2: answeredOk('goal') && answeredOk('position'),
    3: answeredOk('telemetry'),
    4: sequenceDone,
  }
  const latestAnswered = Object.values(exchanges.map)
    .filter((e) => e?.state === 'answered')
    .sort((a, b) => b!.txTime - a!.txTime)[0]
  const latestStatus = responseStatus(latestAnswered)
  const lastAlarm = latestStatus !== null && latestStatus !== 0 ? latestStatus : null

  const serialSupported = 'serial' in navigator

  return (
    <AppContext.Provider value={context}>
      <ProgressNav done={done} connected={connected} lastAlarm={lastAlarm} />
      <main>
        <header className="app-header">
          <div>
            <h1>Laboratorio L1: servo Feetech STS via Web Serial</h1>
            <p className="note">Ogni comando è un pacchetto di pochi byte: qui vedi quali, e perché.</p>
          </div>
          <div className="row">
            <ThemeToggle />
            <button type="button" className="learn-button" onClick={() => setLearnTopic('overview')}>
              Scopri di più sull'app
            </button>
          </div>
        </header>
        {!serialSupported && (
          <p className="error">
            Questo browser non supporta Web Serial. Usa Chrome o Edge (Firefox dalla 151 con il
            permesso aggiuntivo; Safari non è supportato).
          </p>
        )}
        <div className="layout">
          <div className="controls">
            <ConnectPanel connection={connection} servo={servo} connected={connected} />
            <PositionPanel servo={servo} connected={connected} />
            <MonitorPanel servo={servo} connected={connected} />
            <SequencePanel servo={servo} connected={connected} />
            <DiagnosticsPanel servo={servo} connected={connected} />
          </div>
          <LogPanel
            entries={log}
            counts={counts}
            onClear={() => {
              setLog([])
              setCounts(NO_COUNTS)
            }}
          />
        </div>
      </main>
      <LearnDrawer topic={learnTopic} onClose={() => setLearnTopic(null)} onNavigate={setLearnTopic} />
    </AppContext.Provider>
  )
}
