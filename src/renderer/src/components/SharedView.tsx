import type { LeaguesTree } from '@shared/tree'
import FileList from './FileList'

function SharedView({ tree }: { tree: LeaguesTree }): React.JSX.Element {
  return (
    <>
      <header>
        <div>
          <h1>Shared documents</h1>
          <div className="sub">General documents used by every league</div>
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>Shared</h2>
          <button
            className="link"
            onClick={() => void window.api.revealFile(`${tree.root}/_shared`)}
          >
            Show in folder
          </button>
        </div>
        <FileList
          files={tree.sharedFiles}
          dropInto={tree.hasShared ? `${tree.root}/_shared` : undefined}
          emptyLabel="Drop general documents here — opening times, lane prices…"
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Templates</h2>
          <button
            className="link"
            onClick={() => void window.api.revealFile(`${tree.root}/_templates`)}
          >
            Show in folder
          </button>
        </div>
        <FileList
          files={tree.templateFiles}
          dropInto={tree.hasTemplates ? `${tree.root}/_templates` : undefined}
          emptyLabel="Documents here are copied into every new season"
        />
      </section>
    </>
  )
}

export default SharedView
