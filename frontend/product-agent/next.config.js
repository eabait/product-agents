const path = require('path')

const workspaceRoot = path.resolve(__dirname, '..', '..')

const packageAlias = {
  '@product-agents/skills-prd': path.join(workspaceRoot, 'packages/skills/prd/src'),
  '@product-agents/product-agent': path.join(workspaceRoot, 'packages/product-agent/src'),
  '@product-agents/prd-agent': path.join(workspaceRoot, 'packages/prd-agent/src'),
  '@product-agents/prd-shared': path.join(workspaceRoot, 'packages/shared/prd-shared/src'),
  '@product-agents/agent-core': path.join(workspaceRoot, 'packages/shared/agent-core/src'),
  '@product-agents/openrouter-client': path.join(workspaceRoot, 'packages/shared/openrouter-client/src'),
  '@product-agents/model-compatibility': path.join(workspaceRoot, 'packages/shared/model-compatibility/src')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    externalDir: true
  },
  transpilePackages: Object.keys(packageAlias),
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  },
  webpack: config => {
    for (const [pkg, target] of Object.entries(packageAlias)) {
      config.resolve.alias[pkg] = target
      config.resolve.alias[`${pkg}/*`] = path.join(target, '*')
    }
    return config
  }
}

module.exports = nextConfig
