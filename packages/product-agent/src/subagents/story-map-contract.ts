export interface StoryMapPersonaLink {
  personaId: string
  goal: string
  painPoints?: string[]
}

export interface StoryMapStory {
  id: string
  title: string
  asA: string
  iWant: string
  soThat: string
  acceptanceCriteria: string[]
  effort?: 'xs' | 's' | 'm' | 'l' | 'xl'
  confidence?: number
  personas?: StoryMapPersonaLink[]
}

export interface StoryMapEpic {
  id: string
  name: string
  outcome: string
  stories: StoryMapStory[]
  dependencies?: string[]
  metrics?: string[]
}

export interface StoryMapReleaseRing {
  label: string
  targetDate?: string
  epicIds: string[]
}

export interface StoryMapRoadmapNotes {
  releaseRings?: StoryMapReleaseRing[]
  risks?: string[]
  assumptions?: string[]
}

export interface StoryMapArtifact {
  version: string
  label: string
  personasReferenced: string[]
  epics: StoryMapEpic[]
  roadmapNotes?: StoryMapRoadmapNotes
}
