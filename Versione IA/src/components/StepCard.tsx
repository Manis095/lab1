import type { ReactNode } from 'react'
import { LEARN_TOPICS, type TopicId } from '../learn/content'
import { useOpenLearn } from './appContext'

interface Props {
  id: string
  topic: TopicId
  /** Numero del passo; assente per le schede di servizio (Diagnostica). */
  number?: number
  title: string
  /** Sostituisce la riga "Cosa succede" presa dai contenuti. */
  whatHappens?: string
  children: ReactNode
}

/** Scheda di un passo: numero, titolo, "Cosa succede" e bottone "Scopri di più". */
export function StepCard({ id, topic, number, title, whatHappens, children }: Props) {
  const openLearn = useOpenLearn()
  return (
    <section className="panel step-card" id={id} aria-labelledby={`${id}-title`}>
      <header className="step-header">
        {number !== undefined && <span className="step-number">{number}</span>}
        <h2 id={`${id}-title`}>{title}</h2>
        <button type="button" className="learn-button" onClick={() => openLearn(topic)}>
          Scopri di più
        </button>
      </header>
      <p className="what-happens">
        <strong>Cosa succede.</strong> {whatHappens ?? LEARN_TOPICS[topic].whatHappens}
      </p>
      {children}
    </section>
  )
}
