import { useEffect, useState } from 'react'
import { ConnectPanel } from './components/ConnectPanel'
import { type LogEntry, LogPanel } from './components/LogPanel'
import { PositionPanel } from './components/PositionPanel'
import { SerialConnection } from './serial/connection'
import { Servo } from './serial/servo'

const MAX_LOG_ENTRIES = 400

let logSeq = 0

export default function App() {
  // Una connessione per tutta la vita del componente; si apre solo da clic.
  const [connection] = useState(() => new SerialConnection())
  const [servo] = useState(() => new Servo(connection))
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])

  useEffect(() => {
    const offTraffic = connection.onTraffic((event) => {
      setLog((prev) => [...prev.slice(-(MAX_LOG_ENTRIES - 1)), { ...event, seq: logSeq++ }])
    })
    const offState = connection.onConnectionChange(setConnected)
    return () => {
      offTraffic()
      offState()
      // In StrictMode (sviluppo) e nel ricaricamento a caldo il cleanup chiude la porta.
      void connection.disconnect()
    }
  }, [connection])

  const serialSupported = 'serial' in navigator

  return (
    <main>
      <h1>Laboratorio L1: servo Feetech STS via Web Serial</h1>
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
        </div>
        <LogPanel entries={log} onClear={() => setLog([])} />
      </div>
    </main>
  )
}
