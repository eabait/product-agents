export interface StoryMapPersonaLink {
  personaId: string;
  goal: string;
}

export interface StoryMapStory {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  effort?: 'xs' | 's' | 'm' | 'l' | 'xl';
  personas?: StoryMapPersonaLink[];
}

export interface StoryMapEpic {
  id: string;
  name: string;
  outcome: string;
  stories: StoryMapStory[];
}

export interface StoryMapArtifact {
  version: string;
  label: string;
  personasReferenced: string[];
  epics: StoryMapEpic[];
}

export interface StoryMapArtifactShape {
  id?: string;
  kind?: 'story-map';
  data?: StoryMapArtifact;
  version?: string;
  label?: string;
  epics?: StoryMapEpic[];
  personasReferenced?: string[];
}
