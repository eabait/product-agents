import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: {
    compilerOptions: {
      composite: false
    }
  },
  splitting: false,
  clean: true,
  target: 'es2022',
  noExternal: [
    '@product-agents/product-agent',
    '@product-agents/prd-shared',
    '@product-agents/agent-core',
    '@product-agents/skills-prd',
    '@product-agents/persona-agent'
  ],
  external: [
    '@product-agents/observability',
    '@product-agents/openrouter-client',
    '@openrouter/ai-sdk-provider',
    'ai',
    'zod'
  ]
})
