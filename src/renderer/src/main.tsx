import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { watchSystemTheme } from './theme'
import { initAnalytics } from './lib/analytics'

// Page-lifetime watcher: runs before first paint so the initial frame is
// already themed; the returned cleanup is deliberately unused.
watchSystemTheme()
void initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
