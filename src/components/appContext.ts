// Stato condiviso dall'interfaccia: ultimi scambi sul bus e apertura del ripasso.

import { createContext, useContext } from 'react'
import type { TopicId } from '../learn/content'
import type { Exchange, ExchangeMap } from '../learn/exchanges'

export interface AppContextValue {
  exchanges: ExchangeMap
  openLearn: (topic: TopicId) => void
}

export const AppContext = createContext<AppContextValue>({
  exchanges: {},
  openLearn: () => undefined,
})

export function useExchanges(): ExchangeMap {
  return useContext(AppContext).exchanges
}

export function useOpenLearn(): (topic: TopicId) => void {
  return useContext(AppContext).openLearn
}

/** Lo scambio più recente, di qualsiasi tipo. */
export function latestExchange(map: ExchangeMap): Exchange | null {
  let latest: Exchange | null = null
  for (const exchange of Object.values(map)) {
    if (exchange && (!latest || exchange.txTime >= latest.txTime)) latest = exchange
  }
  return latest
}
