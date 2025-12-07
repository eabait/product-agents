import { readFile, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { createMatchPath } from 'tsconfig-paths'

const TS_EXTENSIONS = ['.ts', '.tsx']
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs']

const tsconfigPath = (() => {
  const rootFromWorkspace = path.resolve(process.cwd(), '../../tsconfig.json')
  if (path.basename(process.cwd()) === 'product-agent') {
    return rootFromWorkspace
  }
  const rootFromRoot = path.resolve(process.cwd(), 'tsconfig.json')
  return path.basename(rootFromRoot) === 'tsconfig.json' ? rootFromRoot : rootFromWorkspace
})()

let matchPath
try {
  const raw = readFileSync(tsconfigPath, 'utf8')
  const parsed = JSON.parse(raw)
  const baseUrl = parsed?.compilerOptions?.baseUrl ?? '.'
  const paths = parsed?.compilerOptions?.paths ?? {}
  const absoluteBaseUrl = path.resolve(path.dirname(tsconfigPath), baseUrl)
  matchPath = createMatchPath(absoluteBaseUrl, paths, undefined, FILE_EXTENSIONS)
} catch (error) {
  console.warn('[ts-loader] Failed to initialize path matching:', error)
}

const resolveFromParent = async (specifier, parentURL) => {
  const parentPath = parentURL ? fileURLToPath(parentURL) : process.cwd()
  const basePath = path.resolve(path.dirname(parentPath), specifier)
  const ext = path.extname(basePath)
  const baseCandidates =
    ext && ['.js', '.mjs', '.cjs'].includes(ext)
      ? [basePath.slice(0, -ext.length), basePath]
      : [basePath]

  const candidates = TS_EXTENSIONS.some(extension => specifier.endsWith(extension))
    ? baseCandidates
    : baseCandidates.flatMap(base => [
        ...TS_EXTENSIONS.map(extCandidate => `${base}${extCandidate}`),
        ...TS_EXTENSIONS.map(extCandidate => path.join(base, `index${extCandidate}`))
      ])

  for (const candidate of candidates) {
    try {
      const fileStat = await stat(candidate)
      if (fileStat.isFile()) {
        return pathToFileURL(candidate).href
      }
    } catch {
      // continue trying candidates
    }
  }

  return null
}

const resolveAlias = async (specifier) => {
  if (!matchPath) {
    return null
  }

  const matched = matchPath(specifier)
  if (!matched) {
    return null
  }

  const attemptCandidates = new Set()
  attemptCandidates.add(matched)

  if (!FILE_EXTENSIONS.some(ext => matched.endsWith(ext))) {
    for (const ext of FILE_EXTENSIONS) {
      attemptCandidates.add(`${matched}${ext}`)
    }
    for (const ext of FILE_EXTENSIONS) {
      attemptCandidates.add(path.join(matched, `index${ext}`))
    }
  }

  for (const candidate of attemptCandidates) {
    try {
      const fileStat = await stat(candidate)
      if (fileStat.isFile()) {
        return pathToFileURL(candidate).href
      }
    } catch {
      // keep trying
    }
  }

  return null
}

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith('node:')) {
    return defaultResolve(specifier, context, defaultResolve)
  }

  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const resolvedUrl = await resolveFromParent(specifier, context.parentURL)
    if (resolvedUrl) {
      return { url: resolvedUrl, shortCircuit: true }
    }
  }

  if (!specifier.startsWith('.') && !specifier.startsWith('/') && matchPath) {
    const aliasUrl = await resolveAlias(specifier)
    if (aliasUrl) {
      return { url: aliasUrl, shortCircuit: true }
    }
  }

  if (TS_EXTENSIONS.some(ext => specifier.endsWith(ext))) {
    const resolved = await defaultResolve(specifier, context, defaultResolve)
    return { ...resolved, shortCircuit: true }
  }

  return defaultResolve(specifier, context, defaultResolve)
}

export async function load(url, context, defaultLoad) {
  if (TS_EXTENSIONS.some(ext => url.endsWith(ext))) {
    let source
    try {
      source = await readFile(new URL(url), 'utf8')
    } catch (error) {
      if (error && error.code === 'EISDIR') {
        console.error('[ts-loader] Attempted to load directory as file:', url)
      }
      throw error
    }
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true
      },
      fileName: fileURLToPath(url)
    })

    return {
      format: 'module',
      source: transpiled.outputText,
      shortCircuit: true
    }
  }

  return defaultLoad(url, context, defaultLoad)
}
