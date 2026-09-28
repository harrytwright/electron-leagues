import { useKumoToastManager } from '@cloudflare/kumo'
import type { RosterSeason, SeasonFile } from '@shared/members'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useQueryRefresh } from './use-query-refresh'
import { useWriteOperation } from './use-write-operation'

export interface SeasonSave {
  pending: boolean
  /** Writes the whole season file; resolves null when saved, or the message that stopped it. */
  save: (file: SeasonFile, done: string) => Promise<string | null>
}

/** The Players tab already shows a player of a vanished team as a sub; the file says so too. */
function withDanglingTeamsAsSubs(file: SeasonFile): SeasonFile {
  const teamIds = new Set(file.teams.map((team) => team.id))
  return {
    ...file,
    players: file.players.map((player) =>
      player.teamId !== null && !teamIds.has(player.teamId) ? { ...player, teamId: null } : player
    )
  }
}

/** One save path for the roster, teams and settings tabs, with the refresh outcome reported. */
export function useSeasonSave(season: RosterSeason): SeasonSave {
  const { add } = useKumoToastManager()
  const coordinator = useQueryRefresh()
  const operation = useWriteOperation({
    label: () => `Saving ${season.leagueName} ${season.season}`,
    write: (file: SeasonFile) =>
      window.api.saveSeason(
        { day: season.day, leagueFolder: season.leagueFolder, seasonName: season.season },
        withDanglingTeamsAsSubs(file),
        season.revision
      )
  })

  return {
    pending: operation.pending,
    save: async (file, done) => {
      try {
        const outcome = await operation.run(file)
        if (outcome.status === 'refresh-failed') {
          const message = `${done}, but the season could not be refreshed: ${outcome.refreshError}`
          add({ title: message, variant: 'error' })
          return message
        }
        if (outcome.result.signInSheet === 'failed') {
          add({
            title: done,
            description: 'The sign-in sheet could not be updated; it is made again when opened.'
          })
          return null
        }
        add({ title: done, variant: 'success' })
        return null
      } catch (caught) {
        const message = ipcErrorMessage(caught)
        add({ title: message, variant: 'error' })
        // A refused write usually means the file moved on; show what is there now.
        void coordinator.refresh()
        return message
      }
    }
  }
}
