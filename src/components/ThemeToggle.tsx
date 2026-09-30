import { useEffect, useState } from 'react'

type Theme = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'lab-l1-theme'

function readStored(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

/** Tema automatico (segue il sistema), chiaro o scuro; la scelta resta nel browser. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStored)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Memoria del browser non disponibile: il tema vale solo per questa visita.
    }
  }, [theme])

  return (
    <label className="theme-toggle">
      Tema{' '}
      <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
        <option value="auto">automatico</option>
        <option value="light">chiaro</option>
        <option value="dark">scuro</option>
      </select>
    </label>
  )
}
