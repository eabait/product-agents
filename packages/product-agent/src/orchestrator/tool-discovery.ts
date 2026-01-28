import type { ArtifactKind } from '../contracts/core'
import type { ToolDescriptor } from '../contracts/orchestrator'
import type { SkillCatalog, CatalogSkill } from '../planner/skill-catalog'
import type { SubagentRegistry } from '../subagents/subagent-registry'
import type { SubagentManifest } from '../contracts/subagent'

/**
 * Infers input artifact kinds for a skill based on its category and section.
 * Skills typically operate on intermediate data rather than full artifacts.
 */
const inferSkillInputArtifacts = (skill: CatalogSkill): ArtifactKind[] => {
  // Most PRD skills work on context/prompt data
  if (skill.category === 'section-writer') {
    return ['prompt', 'prd']
  }
  if (skill.category === 'analyzer') {
    return ['prompt']
  }
  if (skill.category === 'assembler') {
    return ['prd']
  }
  // Default: can work on prompts
  return ['prompt']
}

/**
 * Infers output artifact kind for a skill based on its category.
 */
const inferSkillOutputArtifact = (skill: CatalogSkill): ArtifactKind => {
  if (skill.category === 'assembler') {
    return 'prd'
  }
  if (skill.category === 'section-writer') {
    return 'prd'
  }
  // Default: produces intermediate data (represented as 'prd' for now)
  return 'prd'
}

/**
 * Infers capabilities from a skill's category.
 */
const inferSkillCapabilities = (skill: CatalogSkill): string[] => {
  const capabilities: string[] = [skill.category]

  if (skill.category === 'section-writer' && skill.section) {
    capabilities.push(`write-${skill.section}`)
  }
  if (skill.category === 'analyzer') {
    capabilities.push('analyze')
  }
  if (skill.category === 'assembler') {
    capabilities.push('assemble')
  }

  return capabilities
}

/**
 * Options for ToolDiscovery.
 */
export interface ToolDiscoveryOptions {
  /** SkillCatalog instance for skill discovery */
  skillCatalog: SkillCatalog
  /** SubagentRegistry instance for subagent discovery */
  subagentRegistry: SubagentRegistry
  /** Whether to cache discovered tools */
  enableCache?: boolean
}

/**
 * ToolDiscovery is responsible for discovering all available tools
 * (skills and subagents) and normalizing them into ToolDescriptor format.
 *
 * This provides the Orchestrator with a unified view of its capabilities.
 */
export class ToolDiscovery {
  private readonly skillCatalog: SkillCatalog
  private readonly subagentRegistry: SubagentRegistry
  private readonly enableCache: boolean
  private cachedTools: ToolDescriptor[] | null = null

  constructor(options: ToolDiscoveryOptions) {
    this.skillCatalog = options.skillCatalog
    this.subagentRegistry = options.subagentRegistry
    this.enableCache = options.enableCache ?? true
  }

  /**
   * Discover all available tools (skills and subagents).
   * Results are cached if caching is enabled.
   */
  async discoverAll(): Promise<ToolDescriptor[]> {
    if (this.enableCache && this.cachedTools) {
      return this.cachedTools
    }

    const [skills, subagents] = await Promise.all([
      this.discoverSkills(),
      this.discoverSubagents()
    ])

    const tools = [...skills, ...subagents]

    if (this.enableCache) {
      this.cachedTools = tools
    }

    return tools
  }

  /**
   * Discover only skills.
   * Filters out PRD skills when the PRD subagent is registered.
   */
  async discoverSkills(): Promise<ToolDescriptor[]> {
    const catalogSkills = await this.skillCatalog.listSkills()

    // Check if PRD subagent is registered
    const hasPrdSubagent = this.subagentRegistry.list().some(
      m => m.id === 'prd.core.agent'
    )

    // Filter out PRD skills if PRD subagent is available.
    const filteredSkills = hasPrdSubagent
      ? catalogSkills.filter(skill => !skill.id.startsWith('prd.'))
      : catalogSkills

    return filteredSkills.map(skill => this.skillToDescriptor(skill))
  }

  /**
   * Discover only subagents.
   */
  async discoverSubagents(): Promise<ToolDescriptor[]> {
    const manifests = this.subagentRegistry.list()
    return manifests.map(manifest => this.manifestToDescriptor(manifest))
  }

  /**
   * Find a tool by its ID.
   */
  async findById(toolId: string): Promise<ToolDescriptor | undefined> {
    const tools = await this.discoverAll()
    return tools.find(tool => tool.id === toolId)
  }

  /**
   * Find tools that can consume a given artifact kind.
   */
  async findByInputArtifact(kind: ArtifactKind): Promise<ToolDescriptor[]> {
    const tools = await this.discoverAll()
    return tools.filter(tool =>
      tool.inputArtifacts.length === 0 || tool.inputArtifacts.includes(kind)
    )
  }

  /**
   * Find tools that produce a given artifact kind.
   */
  async findByOutputArtifact(kind: ArtifactKind): Promise<ToolDescriptor[]> {
    const tools = await this.discoverAll()
    return tools.filter(tool => tool.outputArtifact === kind)
  }

  /**
   * Clear the tool cache to force re-discovery.
   */
  clearCache(): void {
    this.cachedTools = null
  }

  /**
   * Convert a CatalogSkill to a ToolDescriptor.
   */
  private skillToDescriptor(skill: CatalogSkill): ToolDescriptor {
    return {
      id: skill.id,
      type: 'skill',
      label: skill.label,
      description: skill.description ?? `${skill.category} skill for ${skill.section ?? 'general'} operations`,
      inputArtifacts: inferSkillInputArtifacts(skill),
      outputArtifact: inferSkillOutputArtifact(skill),
      capabilities: inferSkillCapabilities(skill),
      metadata: {
        packId: skill.packId,
        section: skill.section,
        category: skill.category,
        version: skill.version
      }
    }
  }

  /**
   * Convert a SubagentManifest to a ToolDescriptor.
   */
  private manifestToDescriptor(manifest: SubagentManifest): ToolDescriptor {
    return {
      id: manifest.id,
      type: 'subagent',
      label: manifest.label,
      description: manifest.description ?? `Subagent that creates ${manifest.creates} artifacts`,
      inputArtifacts: manifest.consumes,
      outputArtifact: manifest.creates,
      capabilities: manifest.capabilities ?? [],
      metadata: {
        package: manifest.package,
        version: manifest.version,
        entry: manifest.entry,
        tags: manifest.tags
      }
    }
  }
}

/**
 * Create a ToolDiscovery instance.
 */
export const createToolDiscovery = (options: ToolDiscoveryOptions): ToolDiscovery => {
  return new ToolDiscovery(options)
}
