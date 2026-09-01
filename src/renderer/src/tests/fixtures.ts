import type { LeaguesTree } from '@shared/tree'

export function makeTree(overrides: Partial<LeaguesTree> = {}): LeaguesTree {
  return {
    root: '/root',
    days: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: []
    },
    hasTemplates: true,
    hasShared: true,
    templateFiles: [],
    sharedFiles: [],
    unrecognisedRootEntries: [],
    ...overrides
  }
}
