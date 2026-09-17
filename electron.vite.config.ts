import { sentryVitePlugin } from '@sentry/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import pkg from './package.json'

/**
 * Source map upload for release builds. Reads SENTRY_AUTH_TOKEN from the
 * environment or a gitignored .env.sentry-build-plugin file; without a token
 * the plugin logs a warning and skips the upload rather than failing the
 * build. Debug IDs (injected into both bundle and map) do the matching. The
 * release name is set here and injected into main, so the uploaded maps and
 * the events the SDK reports carry the same name in every build. sentry-cli
 * rejects a scoped package name, so the scope is dropped.
 */
const release = `${pkg.name.replace(/^@[^/]+\//, '')}@${pkg.version}`

function sentryUpload(
  target: 'main' | 'preload' | 'renderer'
): ReturnType<typeof sentryVitePlugin> {
  return sentryVitePlugin({
    org: 'gobowling',
    project: 'leagues',
    telemetry: false,
    release: { name: release },
    sourcemaps: { filesToDeleteAfterUpload: [`out/${target}/**/*.map`] }
  })
}

export default defineConfig(({ command }) => {
  const upload = command === 'build'
  return {
    main: {
      define: { __LEAGUES_RELEASE__: JSON.stringify(release) },
      build: { sourcemap: upload },
      plugins: upload ? [sentryUpload('main')] : []
    },
    preload: {
      build: { sourcemap: upload },
      plugins: upload ? [sentryUpload('preload')] : []
    },
    renderer: {
      build: {
        sourcemap: upload ? 'hidden' : false,
        rollupOptions: {
          input: {
            index: resolve('src/renderer/index.html'),
            help: resolve('src/renderer/help.html')
          }
        }
      },
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared')
        }
      },
      plugins: [react(), tailwindcss(), ...(upload ? [sentryUpload('renderer')] : [])]
    }
  }
})
