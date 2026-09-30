import { useEffect, useRef, useState } from 'react'
import { NotConnectedError, TimeoutError } from '../serial/connection'
import { formatLoad } from '../serial/diagnostics'
import { currentToMilliamps, decodeLoad, voltageToVolts } from '../serial/registers'
import type { Servo, Telemetry } from '../serial/servo'
import { sleep } from '../serial/timing'
import { describeError } from './errors'
import { ExchangeView } from './ExchangeView'
import { LineChart } from './LineChart'
import { StepCard } from './StepCard'
import { StatusBadge } from './StatusBadge'

/** Periodo di campionamento del monitor. */
const MONITOR_PERIOD_MS = 100
/** Campioni tenuti per i grafici: 100 × 100 ms = 10 s. */
const HISTORY_LENGTH = 100
/** Righe mostrate nella tabella dei campioni. */
const TABLE_ROWS = 15

interface Sample extends Telemetry {
  seq: number
  time: number
  status: number
}

interface Props {
  servo: Servo
  connected: boolean
}

const fmt = (value: number, digits = 1) =>
  value.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits })

/**
 * Passo 3: lettura periodica di carico, tensione, temperatura, movimento e
 * corrente. Il ciclo attende ogni risposta prima della richiesta successiva,
 * quindi le richieste non si sovrappongono mai.
 */
export function MonitorPanel({ servo, connected }: Props) {
  const [running, setRunning] = useState(false)
  const [samples, setSamples] = useState<Sample[]>([])
  const [timeouts, setTimeouts] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  function stop() {
    controllerRef.current?.abort()
    controllerRef.current = null
    setRunning(false)
  }

  async function loop(signal: AbortSignal) {
    let seq = 0
    while (!signal.aborted) {
      const started = performance.now()
      try {
        const { value, status } = await servo.readTelemetry()
        if (signal.aborted) break
        setSamples((prev) => [
          ...prev.slice(-(HISTORY_LENGTH - 1)),
          { ...value, status, seq: seq++, time: Date.now() },
        ])
      } catch (err) {
        if (err instanceof TimeoutError) {
          setTimeouts((n) => n + 1) // sporadici sono normali; il log avvisa se sono molti di fila
        } else {
          setError(describeError(err))
          if (err instanceof NotConnectedError) break
        }
      }
      await sleep(Math.max(0, MONITOR_PERIOD_MS - (performance.now() - started)), signal)
    }
    if (controllerRef.current?.signal === signal) stop()
  }

  function start() {
    const controller = new AbortController()
    controllerRef.current = controller
    setRunning(true)
    setError(null)
    setTimeouts(0)
    void loop(controller.signal)
  }

  // Ferma il ciclo se la porta si chiude o il componente viene smontato.
  useEffect(() => {
    if (!connected) controllerRef.current?.abort()
  }, [connected])
  useEffect(() => () => controllerRef.current?.abort(), [])

  const last = samples.at(-1)
  const load = last ? decodeLoad(last.loadRaw) : null
  const loadPoints = samples.map((s) => ({ t: s.time, v: decodeLoad(s.loadRaw).percent }))
  const currentPoints = samples.map((s) => ({ t: s.time, v: currentToMilliamps(s.currentRaw) }))
  const loadMax = Math.max(10, ...loadPoints.map((p) => p.v))
  const currentMax = Math.max(100, ...currentPoints.map((p) => p.v))

  return (
    <StepCard id="passo-3" topic="step3" number={3} title="Temperatura, tensione, carico e corrente">
      <div className="row">
        <button
          type="button"
          className={running ? '' : 'primary'}
          onClick={running ? stop : start}
          disabled={!connected && !running}
        >
          {running ? 'Ferma' : 'Avvia'}
        </button>
        <span className="note">
          Una lettura ogni {MONITOR_PERIOD_MS} ms (registri 60..70 in un'unica richiesta). Timeout: {timeouts}
        </span>
      </div>

      {last && load && (
        <>
          <div className="row">
            <span className={last.movingRaw === 0 ? 'badge ok' : 'badge warn'}>
              {last.movingRaw === 0 ? 'fermo' : last.movingRaw === 1 ? 'in movimento' : `movimento: ${last.movingRaw}?`}
            </span>
            <StatusBadge status={last.status} />
          </div>
          <div className="tiles">
            <div className="tile">
              <span className="tile-label">Carico</span>
              <span className="tile-value">{fmt(load.percent)}%</span>
              <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={load.percent} aria-label="Carico">
                <div style={{ width: `${Math.min(100, load.percent)}%` }} />
              </div>
              <span className="note">
                grezzo {last.loadRaw}, direzione {load.direction}
                {!load.plausible && ' (FORMATO NON PLAUSIBILE)'}
              </span>
            </div>
            <div className="tile">
              <span className="tile-label">Corrente</span>
              <span className="tile-value">{fmt(currentToMilliamps(last.currentRaw), 0)} mA</span>
              <span className="note">grezzo {last.currentRaw} × 6,5 mA</span>
            </div>
            <div className="tile">
              <span className="tile-label">Temperatura</span>
              <span className="tile-value">{last.temperatureRaw} °C</span>
              <span className="note">grezzo {last.temperatureRaw}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Tensione</span>
              <span className="tile-value">{fmt(voltageToVolts(last.voltageRaw))} V</span>
              <span className="note">grezzo {last.voltageRaw} × 0,1 V</span>
            </div>
          </div>
        </>
      )}

      {samples.length > 0 && (
        <div className="charts">
          <LineChart
            title="Carico (% della coppia massima), ultimi 10 s"
            points={loadPoints}
            yMax={loadMax}
            format={(v) => `${fmt(v)}%`}
            detail={(i) => `direzione ${decodeLoad(samples[i].loadRaw).direction}, grezzo ${samples[i].loadRaw}`}
          />
          <LineChart
            title="Corrente (mA), ultimi 10 s"
            points={currentPoints}
            yMax={currentMax}
            format={(v) => `${fmt(v, 0)} mA`}
            detail={(i) => `grezzo ${samples[i].currentRaw}`}
          />
        </div>
      )}

      {samples.length > 0 && (
        <div className="table-wrap">
          <h3>Ultimi {Math.min(TABLE_ROWS, samples.length)} campioni</h3>
          <table>
            <thead>
              <tr>
                <th>Ora</th>
                <th>Carico</th>
                <th>°C</th>
                <th>V</th>
                <th>mA</th>
                <th>Mov.</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {samples.slice(-TABLE_ROWS).reverse().map((s) => (
                <tr key={s.seq}>
                  <td>{new Date(s.time).toLocaleTimeString('it-IT')}</td>
                  <td>{formatLoad(s.loadRaw)}</td>
                  <td>{s.temperatureRaw}</td>
                  <td>{fmt(voltageToVolts(s.voltageRaw))}</td>
                  <td>{fmt(currentToMilliamps(s.currentRaw), 0)}</td>
                  <td>{s.movingRaw}</td>
                  <td className={s.status === 0 ? '' : 'alarm-cell'}>
                    {s.status.toString(16).toUpperCase().padStart(2, '0')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">
        Indirizzi e conversioni da una tabella di terze parti dell'STS3215, da confermare sul portale del
        corso. Prova: sforza il servo a mano, deve restare fermo mentre il carico sale.
      </p>
      {error && <p className="error">{error}</p>}
      <ExchangeView keys={['telemetry']} emptyHint={`Premi "Avvia": qui compare l'ultima lettura del blocco 60..70.`} />
    </StepCard>
  )
}
