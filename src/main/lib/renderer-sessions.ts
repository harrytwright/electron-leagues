import { AsyncLocalStorage } from 'node:async_hooks'
import type { WebContents } from 'electron'

type Renderer = Pick<WebContents, 'id'>

interface RendererSession {
  id: string | undefined
}

const sessions = new WeakMap<Renderer, RendererSession>()
const activeSession = new AsyncLocalStorage<RendererSession>()

export function setRendererSession(contents: Renderer, sessionId: string): void {
  const session = sessions.get(contents)
  if (session && session.id === undefined) session.id = sessionId
  else sessions.set(contents, { id: sessionId })
}

export function withRendererSession<T>(contents: Renderer, run: () => T): T {
  const session = sessions.get(contents) ?? { id: undefined }
  sessions.set(contents, session)
  return activeSession.run(session, run)
}

export function currentRendererSession(): string | undefined {
  return activeSession.getStore()?.id
}
