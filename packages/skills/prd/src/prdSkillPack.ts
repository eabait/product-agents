import { SECTION_NAMES, type SectionName } from '@product-agents/prd-shared'

export type PrdSkillCategory = 'analyzer' | 'section-writer' | 'assembly'

export interface PrdSkillManifestEntry {
  id: string
  label: string
  version: string
  category: PrdSkillCategory
  description?: string
  section?: SectionName
}

export interface PrdSkillPackManifest {
  id: string
  version: string
  label: string
  description?: string
  skills: PrdSkillManifestEntry[]
}

const SECTION_LABELS: Record<SectionName, string> = {
  [SECTION_NAMES.TARGET_USERS]: 'Target Users Section Writer',
  [SECTION_NAMES.SOLUTION]: 'Solution Section Writer',
  [SECTION_NAMES.KEY_FEATURES]: 'Key Features Section Writer',
  [SECTION_NAMES.SUCCESS_METRICS]: 'Success Metrics Section Writer',
  [SECTION_NAMES.CONSTRAINTS]: 'Constraints Section Writer'
}

export const prdSkillPack: PrdSkillPackManifest = {
  id: 'prd.core',
  version: '0.2.0',
  label: 'PRD Core Skills',
  description: 'Context analysis, section writers, and assembly primitives for PRD generation.',
  skills: [
    {
      id: 'prd.check-clarification',
      label: 'Clarification Analyzer',
      version: '1.0.0',
      category: 'analyzer',
      description: 'Evaluates the incoming request and decides if clarification questions are required.'
    },
    {
      id: 'prd.analyze-context',
      label: 'Context Analyzer',
      version: '1.0.0',
      category: 'analyzer',
      description: 'Summarises user goals, requirements, and constraints to seed downstream writers.'
    },
    ...((Object.values(SECTION_NAMES) as SectionName[]).map(section => ({
      id: `prd.write-${section}`,
      label: SECTION_LABELS[section],
      version: '1.0.0',
      category: 'section-writer' as const,
      section,
      description: `Generates and updates the ${section} section of the PRD.`
    }))),
    {
      id: 'prd.assemble-prd',
      label: 'PRD Assembly',
      version: '1.0.0',
      category: 'assembly',
      description: 'Aggregates section outputs, calculates confidence, and emits final artifact metadata.'
    }
  ]
}

export const listPrdSkills = (): PrdSkillManifestEntry[] => [...prdSkillPack.skills]
