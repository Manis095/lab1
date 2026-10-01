// Traduzione degli errori in messaggi comprensibili in laboratorio.

import { NotConnectedError, TimeoutError } from '../serial/connection'
import { ProtocolError } from '../serial/protocol'
import { UnsafeWriteError } from '../serial/registers'

export function describeError(err: unknown): string {
  if (err instanceof TimeoutError) {
    return `${err.message}. Se succede spesso controlla l'alimentazione a 12 V e il cablaggio.`
  }
  if (err instanceof NotConnectedError) return 'Porta non collegata: premi "Collega".'
  if (err instanceof UnsafeWriteError) return `Scrittura bloccata per sicurezza: ${err.message}`
  if (err instanceof ProtocolError) return `Errore di protocollo: ${err.message}`
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotFoundError':
        return 'Nessuna porta selezionata.'
      case 'InvalidStateError':
        return 'La porta risulta già aperta: ricarica la pagina o chiudi le altre schede che la usano.'
      case 'NetworkError':
        return (
          'Impossibile aprire la porta: è occupata da un altro programma o scheda, ' +
          'oppure è rimasta aperta. Chiudi le altre schede; se non basta scollega e ricollega il cavo USB.'
        )
      case 'SecurityError':
        return 'Permesso negato: la pagina deve essere su localhost o https e la porta scelta da un clic.'
    }
  }
  return err instanceof Error ? err.message : String(err)
}
