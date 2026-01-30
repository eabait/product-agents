// Re-export canonical types from product-agent package
export type {
  StoryMapArtifact,
  StoryMapEpic,
  StoryMapStory,
  StoryMapPersonaLink,
  StoryMapReleaseRing,
  StoryMapRoadmapNotes
} from '@product-agents/product-agent';

import type { StoryMapArtifact, StoryMapEpic } from '@product-agents/product-agent';

/**
 * Shape for artifacts that may come in different formats.
 * Used to handle both wrapped (Artifact<StoryMapArtifact>) and flat formats.
 */
export interface StoryMapArtifactShape {
  id?: string;
  kind?: 'story-map';
  data?: StoryMapArtifact;
  version?: string;
  label?: string;
  epics?: StoryMapEpic[];
  personasReferenced?: string[];
}

/**
 * Type guard to check if a value is a valid story map artifact shape
 */
export function isStoryMapArtifact(value: unknown): value is StoryMapArtifactShape {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as StoryMapArtifactShape;

  // Check for wrapped artifact structure
  if (obj.kind === 'story-map' && obj.data?.epics) {
    return true;
  }

  // Check for direct story-map structure
  if (Array.isArray(obj.epics) && typeof obj.version === 'string') {
    return true;
  }

  return false;
}

/**
 * Normalizes story map data from either wrapped or flat format to StoryMapArtifact
 */
export function normalizeStoryMapData(artifact: StoryMapArtifactShape): StoryMapArtifact {
  if (artifact.data) {
    return artifact.data;
  }
  return {
    version: artifact.version ?? '1.0.0',
    label: artifact.label ?? 'Story Map',
    personasReferenced: artifact.personasReferenced ?? [],
    epics: artifact.epics ?? []
  };
}
