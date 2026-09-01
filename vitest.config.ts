import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Dates are formatted in the local zone; pin it so assertions hold everywhere.
process.env.TZ = 'UTC'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['src/{main,shared,preload}/**/*.spec.ts'],
          environment: 'node'
        }
      },
      {
        resolve: {
          alias: {
            '@renderer': resolve('src/renderer/src'),
            '@shared': resolve('src/shared')
          }
        },
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.spec.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['src/renderer/src/tests/setup.ts']
        }
      }
    ]
  }
})
