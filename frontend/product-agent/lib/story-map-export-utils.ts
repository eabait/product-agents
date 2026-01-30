interface StoryMapPersonaLink {
  personaId: string;
  goal: string;
  painPoints?: string[];
}

interface StoryMapStory {
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

interface StoryMapEpic {
  id: string;
  name: string;
  outcome: string;
  stories: StoryMapStory[];
  dependencies?: string[];
  metrics?: string[];
}

interface StoryMapRoadmapNotes {
  releaseRings?: Array<{
    label: string;
    targetDate?: string;
    epicIds: string[];
  }>;
  risks?: string[];
  assumptions?: string[];
}

interface StoryMapArtifact {
  version: string;
  label: string;
  personasReferenced: string[];
  epics: StoryMapEpic[];
  roadmapNotes?: StoryMapRoadmapNotes;
}

export function storyMapToMarkdown(data: StoryMapArtifact): string {
  const lines: string[] = [];

  lines.push(`# ${data.label || 'Story Map'}`);
  lines.push('');

  if (data.personasReferenced && data.personasReferenced.length > 0) {
    lines.push(`**Personas Referenced:** ${data.personasReferenced.join(', ')}`);
    lines.push('');
  }

  if (data.epics && data.epics.length > 0) {
    for (const epic of data.epics) {
      lines.push(`## ${epic.name}`);
      lines.push('');
      lines.push(`**Outcome:** ${epic.outcome}`);
      lines.push('');

      if (epic.dependencies && epic.dependencies.length > 0) {
        lines.push(`**Dependencies:** ${epic.dependencies.join(', ')}`);
        lines.push('');
      }

      if (epic.metrics && epic.metrics.length > 0) {
        lines.push('**Success Metrics:**');
        for (const metric of epic.metrics) {
          lines.push(`- ${metric}`);
        }
        lines.push('');
      }

      if (epic.stories && epic.stories.length > 0) {
        for (const story of epic.stories) {
          lines.push(`### ${story.title}`);
          lines.push('');
          lines.push(`> As a **${story.asA}**, I want **${story.iWant}**, so that **${story.soThat}**.`);
          lines.push('');

          const effortLabel = story.effort ? story.effort.toUpperCase() : 'TBD';
          const confidenceLabel = story.confidence !== undefined
            ? `${Math.round(story.confidence * 100)}%`
            : 'N/A';
          lines.push(`**Effort:** ${effortLabel} | **Confidence:** ${confidenceLabel}`);
          lines.push('');

          if (story.personas && story.personas.length > 0) {
            lines.push(`**Personas:** ${story.personas.map(p => p.personaId).join(', ')}`);
            lines.push('');
          }

          if (story.acceptanceCriteria && story.acceptanceCriteria.length > 0) {
            lines.push('**Acceptance Criteria:**');
            for (const ac of story.acceptanceCriteria) {
              lines.push(`- [ ] ${ac}`);
            }
            lines.push('');
          }
        }
      }
    }
  }

  if (data.roadmapNotes) {
    lines.push('---');
    lines.push('');
    lines.push('## Roadmap Notes');
    lines.push('');

    if (data.roadmapNotes.releaseRings && data.roadmapNotes.releaseRings.length > 0) {
      lines.push('### Release Rings');
      lines.push('');
      for (const ring of data.roadmapNotes.releaseRings) {
        const dateStr = ring.targetDate ? ` (Target: ${ring.targetDate})` : '';
        lines.push(`**${ring.label}**${dateStr}: ${ring.epicIds.join(', ')}`);
      }
      lines.push('');
    }

    if (data.roadmapNotes.risks && data.roadmapNotes.risks.length > 0) {
      lines.push('### Risks');
      lines.push('');
      for (const risk of data.roadmapNotes.risks) {
        lines.push(`- ${risk}`);
      }
      lines.push('');
    }

    if (data.roadmapNotes.assumptions && data.roadmapNotes.assumptions.length > 0) {
      lines.push('### Assumptions');
      lines.push('');
      for (const assumption of data.roadmapNotes.assumptions) {
        lines.push(`- ${assumption}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export async function copyStoryMapAsJson(data: StoryMapArtifact): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
  }
}

export function downloadStoryMapMarkdown(data: StoryMapArtifact): void {
  const md = storyMapToMarkdown(data);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${(data.label || 'story-map').toLowerCase().replace(/\s+/g, '-')}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
