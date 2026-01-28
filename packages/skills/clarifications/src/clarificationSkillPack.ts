export type ClarificationSkillManifestEntry = {
  id: string
  label: string
  version: string
  category: 'analyzer' | string
  description?: string
}

export type ClarificationSkillPackManifest = {
  id: string
  version: string
  label: string
  description?: string
  skills: ClarificationSkillManifestEntry[]
}

export const clarificationSkillPack: ClarificationSkillPackManifest = {
  id: 'clarification.core',
  version: '1.0.0',
  label: 'Clarification Skills',
  description: 'Analyzers that detect missing context and generate targeted clarification questions.',
  skills: [
    {
      id: 'clarification.check',
      label: 'Clarification Analyzer',
      version: '1.0.0',
      category: 'analyzer',
      description: 'Evaluates input completeness and drafts critical clarification questions.'
    }
  ]
}

export const listClarificationSkills = (): ClarificationSkillManifestEntry[] => [
  ...clarificationSkillPack.skills
]
