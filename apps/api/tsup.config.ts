import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  noExternal: [
    '@product-agents/product-agent',
    '@product-agents/prd-agent',
    '@product-agents/prd-shared',
    '@product-agents/agent-core'
  ]
})
