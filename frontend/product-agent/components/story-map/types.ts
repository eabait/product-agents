export interface StoryMapPersonaLink {
  personaId: string;
  goal: string;
  painPoints?: string[];
}

export interface StoryMapStory {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  effort?: 'xs' | 's' | 'm' | 'l' | 'xl';
  confidence?: number;
  personas?: StoryMapPersonaLink[];
}

export interface StoryMapEpic {
  id: string;
  name: string;
  outcome: string;
  stories: StoryMapStory[];
  dependencies?: string[];
  metrics?: string[];
}

export interface StoryMapRoadmapNotes {
  releaseRings?: Array<{
    label: string;
    targetDate?: string;
    epicIds: string[];
  }>;
  risks?: string[];
  assumptions?: string[];
}

export interface StoryMapArtifact {
  version: string;
  label: string;
  personasReferenced: string[];
  epics: StoryMapEpic[];
  roadmapNotes?: StoryMapRoadmapNotes;
}

export interface StoryMapArtifactShape {
  id?: string;
  kind?: 'story-map';
  data?: StoryMapArtifact;
  version?: string;
  label?: string;
  epics?: StoryMapEpic[];
  personasReferenced?: string[];
  roadmapNotes?: StoryMapRoadmapNotes;
}
