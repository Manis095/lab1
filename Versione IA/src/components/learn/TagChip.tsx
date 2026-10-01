import { TAG_LABELS, type Tag } from '../../learn/content'

/** Etichetta di affidabilità: testo sempre presente, il colore è solo un aiuto. */
export function TagChip({ tag }: { tag: Tag }) {
  return <span className={`tag tag-${tag}`}>{TAG_LABELS[tag]}</span>
}

/** Indica se un esempio usa i byte veri dell'ultima richiesta o un esempio fisso. */
export function SourceNote({ time, what }: { time: number | null; what: string }) {
  return time !== null ? (
    <p className="source source-live">
      Dati reali: {what} delle {new Date(time).toLocaleTimeString('it-IT')}
    </p>
  ) : (
    <p className="source">Esempio fisso: nessun traffico ancora. Collegati per vedere i tuoi byte.</p>
  )
}
