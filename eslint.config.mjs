import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'
import pluginQuery from '@tanstack/eslint-plugin-query'
import vitest from '@vitest/eslint-plugin'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'scripts/**',
      'tools/oxlint/anti-slop/**',
      '.agents/**',
      '.claude/**'
    ]
  },
  tseslint.configs.recommended,
  pluginQuery.configs['flat/recommended'],
  {
    files: ['**/*.spec.{ts,tsx}', 'src/renderer/src/tests/**'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      'vitest/prefer-called-exactly-once-with': 'off',
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'warn',
      'vitest/expect-expect': 'error',
      'vitest/no-identical-title': 'error'
    }
  },
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  eslintConfigPrettier
)
