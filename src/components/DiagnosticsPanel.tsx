import { useState } from 'react'
import { DIAGNOSTIC_REGISTERS } from '../serial/diagnostics'
import type { Servo } from '../serial/servo'
import { describeError } from './errors'

interface Row {
  address: number
  raw?: number
  status?: number
  error?: string
}

interface Props {
  servo: Servo
  connected: boolean
}

const hex = (value: number, digits: number) => value.toString(16).toUpperCase().padStart(digits, '0')

/**
 * Lettura singola dei registri 56, 60, 62, 63, 66, 69: valore grezzo accanto a
 * quello convertito, per confrontarli con i valori attesi a servo fermo.
 * Una richiesta per registro, così nel log ogni scambio è riconoscibile.
 */
export function DiagnosticsPanel({ servo, connected }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleRun() {
    setBusy(true)
    const result: Row[] = []
    for (const reg of DIAGNOSTIC_REGISTERS) {
      try {
        const { value, status } = await servo.readRegister(reg.address, reg.size)
        result.push({ address: reg.address, raw: value, status })
      } catch (err) {
        result.push({ address: reg.address, error: describeError(err) })
      }
    }
    setRows(result)
    setBusy(false)
  }

  return (
    <section className="panel">
      <h2>Diagnostica</h2>
      <div className="row">
        <button type="button" onClick={handleRun} disabled={!connected || busy}>
          Diagnostica
        </button>
        <span className="note">Esegui a servo fermo e senza carichi.</span>
      </div>
      {rows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reg.</th>
                <th>Contenuto</th>
                <th>Grezzo</th>
                <th>Convertito</th>
                <th>Atteso a servo fermo</th>
                <th>Esito</th>
              </tr>
            </thead>
            <tbody>
              {DIAGNOSTIC_REGISTERS.map((reg) => {
                const row = rows.find((r) => r.address === reg.address)
                if (!row || row.raw === undefined) {
                  return (
                    <tr key={reg.address}>
                      <td>{reg.address}</td>
                      <td>{reg.name}</td>
                      <td colSpan={4} className="alarm-cell">
                        {row?.error ?? 'non letto'}
                      </td>
                    </tr>
                  )
                }
                const ok = reg.check?.(row.raw)
                return (
                  <tr key={reg.address}>
                    <td>{reg.address}</td>
                    <td>
                      {reg.name}
                      <br />
                      <small className="note">fonte: {reg.source}</small>
                    </td>
                    <td>
                      {row.raw} <small className="note">(0x{hex(row.raw, reg.size * 2)})</small>
                    </td>
                    <td>{reg.convert(row.raw)}</td>
                    <td>{reg.expected}</td>
                    <td>
                      {ok === undefined ? (
                        <span className="note">nessuna soglia</span>
                      ) : ok ? (
                        <span className="badge ok">ok</span>
                      ) : (
                        <span className="badge alarm">fuori attesa</span>
                      )}
                      {row.status !== 0 && (
                        <span className="badge alarm">stato {hex(row.status ?? 0, 2)}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">
        Se un valore è fuori attesa in modo sistematico (per esempio la tensione non vale circa 120),
        l'indirizzo o la conversione della tabella di terze parti vanno ricontrollati sul portale.
      </p>
    </section>
  )
}
