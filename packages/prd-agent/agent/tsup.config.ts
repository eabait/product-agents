import path from 'node:path'
import { defineConfig } from 'tsup'

const resolveFromRoot = (...segments: string[]) =>
  path.resolve(__dirname, '..', '..', ...segments)

export default defineConfig({
  entry: ['src/index.ts', 'src/http-server.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,
  clean: true,
  bundle: true,
  splitting: false,
  target: 'es2022',
  noExternal: [/^@product-agents\//],
  esbuildOptions(options) {
    options.alias = {
      '@product-agents/prd-shared': resolveFromRoot('shared/prd-shared/src/index.ts'),
      '@product-agents/skills-prd': resolveFromRoot('skills/prd/src/index.ts'),
      '@product-agents/skills-prd/utils': resolveFromRoot('skills/prd/src/utils/index.ts'),
      '@product-agents/agent-core': resolveFromRoot('shared/agent-core/src/index.ts'),
      '@product-agents/model-compatibility': resolveFromRoot('shared/model-compatibility/src/index.ts'),
      '@product-agents/openrouter-client': resolveFromRoot('shared/openrouter-client/src/index.ts')
    }
  }
})
