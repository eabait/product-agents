import type { SkillPackReference } from '../config/product-agent.config'

type SkillPackManifest = {
  id: string
  version: string
  label: string
  description?: string
  skills: Array<{
    id: string
    label: string
    version: string
    category: string
    description?: string
    section?: string
  }>
}

type SkillPackLoader = () => Promise<SkillPackManifest>

const BUILTIN_SKILL_PACKS: Record<string, SkillPackLoader> = {
  'clarification-skill-pack': async () => {
    const module = await import('@product-agents/skills-clarifications')
    return (module as any).clarificationSkillPack
  },
  'prd-skill-pack': async () => {
    const module = await import('@product-agents/skills-prd')
    return (module as any).prdSkillPack
  }
}

export interface CatalogSkill {
  id: string
  label: string
  version: string
  category: string
  description?: string
  section?: string
  packId: string
}

export class SkillCatalog {
  private readonly packs: SkillPackReference[]
  private loaded = false
  private readonly skills = new Map<string, CatalogSkill>()

  constructor(packs: SkillPackReference[]) {
    this.packs = packs
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return
    }

    for (const pack of this.packs) {
      const loader = BUILTIN_SKILL_PACKS[pack.id]
      if (!loader) {
        throw new Error(`Unknown skill pack "${pack.id}". Register a loader before using it.`)
      }

      const manifest = await loader()
      manifest.skills.forEach(skill => {
        if (this.skills.has(skill.id)) {
          return
        }
        this.skills.set(skill.id, {
          id: skill.id,
          label: skill.label,
          version: skill.version,
          category: skill.category,
          description: skill.description,
          section: skill.section,
          packId: manifest.id
        })
      })
    }

    this.loaded = true
  }

  async listSkills(): Promise<CatalogSkill[]> {
    await this.ensureLoaded()
    return Array.from(this.skills.values())
  }

  async listByCategory(category: string): Promise<CatalogSkill[]> {
    await this.ensureLoaded()
    return Array.from(this.skills.values()).filter(skill => skill.category === category)
  }

  async findById(skillId: string): Promise<CatalogSkill | undefined> {
    await this.ensureLoaded()
    return this.skills.get(skillId)
  }
}
