import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  clean: true,
  target: 'es2022',
  external: [
    '@product-agents/product-agent',
    '@product-agents/observability',
    '@product-agents/openrouter-client',
    'ai',
    'zod'
  ]
})
