import { useState } from 'react'
import { type Direction, dissectPacket } from '../learn/anatomy'

interface Props {
  packet: Uint8Array
  direction: Direction
  /** Nasconde la riga di spiegazione (per il log e gli elenchi). */
  compact?: boolean
}

const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0')

/**
 * Pacchetto scomposto: un blocchetto per byte, con colore del campo ed etichetta
 * testuale sempre visibile (il colore non è l'unico segnale). Passando sopra un
 * byte, o selezionandolo da tastiera, compare la sua spiegazione.
 */
export function PacketView({ packet, direction, compact = false }: Props) {
  const anatomy = dissectPacket(packet, direction)
  const [active, setActive] = useState<number | null>(null)
  const activeField = active !== null ? anatomy.fields[active] : null

  return (
    <div className="packet">
      <div className="packet-bytes" role="group" aria-label={`${direction}: ${anatomy.summary}`}>
        <span className={`packet-dir dir-${direction.toLowerCase()}`}>{direction}</span>
        {anatomy.fields.map((field, i) => {
          const alarm =
            (field.kind === 'status' && field.value !== 0) || (field.kind === 'checksum' && !anatomy.checksumOk)
          return (
            <button
              type="button"
              key={field.index}
              className={`byte k-${field.kind}${alarm ? ' byte-alarm' : ''}${active === i ? ' byte-active' : ''}`}
              title={field.description}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <span className="byte-hex">{hex(field.value)}</span>
              <span className="byte-label">{field.label}</span>
            </button>
          )
        })}
      </div>
      {!compact && (
        <p className="packet-caption">
          {activeField ? (
            <>
              <strong>{activeField.label}</strong>: {activeField.description}
            </>
          ) : (
            <>
              {anatomy.summary}. <span className="note">Passa sopra un byte per la spiegazione.</span>
            </>
          )}
        </p>
      )}
    </div>
  )
}
