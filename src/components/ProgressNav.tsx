import type { StepNumber } from './appContext'

interface Props {
  done: Record<StepNumber, boolean>
  connected: boolean
  /** Ultimo byte di stato ricevuto diverso da zero, se c'è. */
  lastAlarm: number | null
}

const STEPS: { n: StepNumber; label: string; href: string }[] = [
  { n: 1, label: 'Collegamento', href: '#passo-1' },
  { n: 2, label: 'Posizione', href: '#passo-2' },
  { n: 3, label: 'Monitor', href: '#passo-3' },
  { n: 4, label: 'Sequenza', href: '#passo-4' },
]

/** Barra di avanzamento fissa in alto: passi cliccabili e stato del collegamento. */
export function ProgressNav({ done, connected, lastAlarm }: Props) {
  return (
    <nav className="progress" aria-label="Passi del laboratorio">
      <ol>
        {STEPS.map((s) => (
          <li key={s.n} className={done[s.n] ? 'done' : ''}>
            <a href={s.href}>
              <span className="progress-num">{done[s.n] ? '✓' : s.n}</span>
              <span>{s.label}</span>
              <span className="visually-hidden">{done[s.n] ? ' (fatto)' : ' (da fare)'}</span>
            </a>
          </li>
        ))}
        <li>
          <a href="#diagnostica">
            <span className="progress-num">?</span>
            <span>Diagnostica</span>
          </a>
        </li>
      </ol>
      <span className={`pill ${lastAlarm !== null ? 'pill-alarm' : connected ? 'pill-on' : ''}`}>
        {lastAlarm !== null
          ? `Allarme: stato ${lastAlarm.toString(16).toUpperCase().padStart(2, '0')}`
          : connected
            ? 'Collegato'
            : 'Non collegato'}
      </span>
    </nav>
  )
}
