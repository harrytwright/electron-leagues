import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { createQueryClient } from './lib/query-client'
import { createWorkspaceStore, type WorkspaceStorage } from './lib/workspace-store'
import { watchSystemTheme } from './theme'
import { initAnalytics } from './lib/analytics'

// Page-lifetime watcher: runs before first paint so the initial frame is
// already themed; the returned cleanup is deliberately unused.
watchSystemTheme()
void initAnalytics()

function localStorageWorkspaceStorage(): WorkspaceStorage {
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
    keys: () => Object.keys(localStorage)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App
      queryClient={createQueryClient()}
      workspaceStore={createWorkspaceStore({ storage: localStorageWorkspaceStorage() })}
    />
  </StrictMode>
)
