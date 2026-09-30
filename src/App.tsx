import { useEffect, useMemo, useState } from 'react'
import { AppContext, type AppContextValue } from './components/appContext'
import { ConnectPanel } from './components/ConnectPanel'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { LearnDrawer } from './components/learn/LearnDrawer'
import { type LogEntry, LogPanel } from './components/LogPanel'
import { MonitorPanel } from './components/MonitorPanel'
import { PositionPanel } from './components/PositionPanel'
import { SequencePanel } from './components/SequencePanel'
import type { TopicId } from './learn/content'
import { applyTraffic, type ExchangeKey, type ExchangeMap } from './learn/exchanges'
import { SerialConnection } from './serial/connection'
import { Servo } from './serial/servo'

const MAX_LOG_ENTRIES = 400

let logSeq = 0

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

  useEffect(() => {
    const offTraffic = connection.onTraffic((event) => {
      setLog((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), { ...event, seq: logSeq++ }])
      setExchanges((prev) => applyTraffic(prev.map, prev.current, event))
    })
    const offState = connection.onConnectionChange(setConnected)
    return () => {
      offTraffic()
      offState()
      // In StrictMode (sviluppo) e nel ricaricamento a caldo il cleanup chiude la porta.
      void connection.disconnect()
    }
  }, [connection])

  const context = useMemo<AppContextValue>(
    () => ({ exchanges: exchanges.map, openLearn: setLearnTopic }),
    [exchanges.map],
  )

  const serialSupported = 'serial' in navigator

  return (
    <AppContext.Provider value={context}>
      <main>
        <header className="app-header">
          <div>
            <h1>Laboratorio L1: servo Feetech STS via Web Serial</h1>
            <p className="note">Ogni comando è un pacchetto di pochi byte: qui vedi quali, e perché.</p>
          </div>
          <button type="button" className="learn-button" onClick={() => setLearnTopic('overview')}>
            Scopri di più sull'app
          </button>
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
          <LogPanel entries={log} onClear={() => setLog([])} />
        </div>
      </main>
      <LearnDrawer topic={learnTopic} onClose={() => setLearnTopic(null)} onNavigate={setLearnTopic} />
    </AppContext.Provider>
  )
}
