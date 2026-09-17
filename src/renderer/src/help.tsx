import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { helpTargetFromSearch } from '@shared/help'
import { HelpApp } from './HelpApp'
import { captureEvent, initAnalytics } from './lib/analytics'
import { helpTopics } from './lib/help/topics'
import { watchSystemTheme } from './theme'

watchSystemTheme()
void initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelpApp
      topics={helpTopics()}
      initialTarget={helpTargetFromSearch(window.location.search)}
      onTopicViewed={(topic) => captureEvent('help_opened', { topic })}
    />
  </StrictMode>
)
