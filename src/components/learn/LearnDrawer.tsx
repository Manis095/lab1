import { useEffect, useRef } from 'react'
import { LEARN_TOPICS, TAG_LEGEND, type TopicId } from '../../learn/content'
import { TagChip } from './TagChip'
import { LearnWidget } from './widgets'

interface Props {
  topic: TopicId | null
  onClose: () => void
  onNavigate: (topic: TopicId) => void
}

const ORDER: TopicId[] = ['overview', 'step1', 'step2', 'step3', 'step4']
const SHORT: Record<TopicId, string> = {
  overview: "L'app",
  step1: 'Passo 1',
  step2: 'Passo 2',
  step3: 'Passo 3',
  step4: 'Passo 4',
}

/** Pannello laterale di ripasso teorico ("Scopri di più"). */
export function LearnDrawer({ topic, onClose, onNavigate }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (topic && !dialog.open) dialog.showModal()
    if (!topic && dialog.open) dialog.close()
    bodyRef.current?.scrollTo({ top: 0 })
  }, [topic])

  const content = topic ? LEARN_TOPICS[topic] : null

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => {
        // Clic sullo sfondo scuro: chiude.
        if (e.target === dialogRef.current) onClose()
      }}
    >
      {content && (
        <div className="drawer-inner">
          <header className="drawer-header">
            <div>
              <p className="drawer-kicker">Scopri di più</p>
              <h2 id="drawer-title">{content.title}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Chiudi">
              Chiudi
            </button>
          </header>
          <nav className="drawer-nav" aria-label="Argomenti">
            {ORDER.map((id) => (
              <button
                type="button"
                key={id}
                className={id === topic ? 'active' : ''}
                aria-current={id === topic ? 'page' : undefined}
                onClick={() => onNavigate(id)}
              >
                {SHORT[id]}
              </button>
            ))}
          </nav>
          <div className="drawer-body" ref={bodyRef}>
            <p className="what-happens">
              <strong>Cosa succede.</strong> {content.whatHappens}
            </p>
            {content.sections.map((section) => (
              <section key={section.title} className="learn-section">
                <h3>{section.title}</h3>
                {section.blocks.map((block, i) => {
                  if (block.kind === 'widget') return <LearnWidget key={i} id={block.widget} />
                  if (block.kind === 'steps') {
                    return (
                      <div key={i} className="claim">
                        <TagChip tag={block.tag} />
                        <div>
                          <p>{block.intro}</p>
                          <ol>
                            {block.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <ul key={i} className="claims">
                      {block.items.map((claim) => (
                        <li key={claim.text} className="claim">
                          <TagChip tag={claim.tag} />
                          <p>{claim.text}</p>
                        </li>
                      ))}
                    </ul>
                  )
                })}
              </section>
            ))}
            <section className="learn-section legend">
              <h3>Come leggere le etichette</h3>
              <ul className="claims">
                {TAG_LEGEND.map((l) => (
                  <li key={l.tag} className="claim">
                    <TagChip tag={l.tag} />
                    <p>{l.text}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </dialog>
  )
}
