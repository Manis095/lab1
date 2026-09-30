import { useState } from 'react'
import type { SerialConnection } from '../serial/connection'
import type { Servo } from '../serial/servo'
import { describeError } from './errors'
import { StatusBadge } from './StatusBadge'

interface Props {
  connection: SerialConnection
  servo: Servo
  connected: boolean
}

/** Passo 1: apertura della porta e ping. */
export function ConnectPanel({ connection, servo, connected }: Props) {
  const [busy, setBusy] = useState(false)
  const [pingStatus, setPingStatus] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [burst, setBurst] = useState<string | null>(null)

  async function ping() {
    setPingStatus(null)
    setPingStatus(await servo.ping())
  }

  // requestPort() è chiamato qui dentro, cioè dal gestore del clic.
  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      await connection.connect()
      await ping()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handlePing() {
    setBusy(true)
    setError(null)
    try {
      await ping()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  // Prova: due richieste lanciate insieme, senza attendere la prima.
  // La coda della connessione le invia una alla volta e separa le risposte.
  async function handleBurst() {
    setBusy(true)
    setError(null)
    setBurst(null)
    try {
      const [status, position] = await Promise.all([servo.ping(), servo.readPosition()])
      setBurst(
        `ping: stato ${status.toString(16).padStart(2, '0')}, posizione: ${position.value} (stato ${position.status.toString(16).padStart(2, '0')})`,
      )
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    setBusy(true)
    await connection.disconnect()
    setPingStatus(null)
    setBusy(false)
  }

  return (
    <section className="panel">
      <h2>Passo 1: collegamento e ping</h2>
      <div className="row">
        {!connected ? (
          <button type="button" className="primary" onClick={handleConnect} disabled={busy}>
            Collega
          </button>
        ) : (
          <>
            <button type="button" onClick={handlePing} disabled={busy}>
              Ping
            </button>
            <button type="button" onClick={handleBurst} disabled={busy}>
              Due richieste di fila
            </button>
            <button type="button" onClick={handleDisconnect} disabled={busy}>
              Scollega
            </button>
          </>
        )}
        <span className={connected ? 'dot on' : 'dot'} />
        <span>{connected ? `Collegato, servo ID ${servo.id}` : 'Non collegato'}</span>
      </div>
      {pingStatus !== null && (
        <p>
          Risposta al ping: <StatusBadge status={pingStatus} />
        </p>
      )}
      {burst && <p>Due richieste di fila: {burst}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}
