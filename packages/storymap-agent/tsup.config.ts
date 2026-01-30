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
  tsconfig: './tsconfig.json',
  noExternal: ['@product-agents/product-agent'],
  external: [
    '@product-agents/observability',
    '@product-agents/openrouter-client',
    'ai',
    'zod'
  ]
})
