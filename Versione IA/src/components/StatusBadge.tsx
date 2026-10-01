import { describeStatus } from '../serial/status'

/** Byte di stato: sempre il valore grezzo, più la traduzione (da verificare). */
export function StatusBadge({ status }: { status: number }) {
  const d = describeStatus(status)
  if (d.ok) {
    return <span className="badge ok">stato {d.hex}: nessuna anomalia</span>
  }
  return (
    <span className="badge alarm">
      stato {d.hex}: ANOMALIA
      <small> {d.flags.join(', ')} (significato dei bit da verificare)</small>
    </span>
  )
}
