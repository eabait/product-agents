interface StoryMapPersonaLink {
  personaId: string;
  goal: string;
}

interface StoryMapStory {
  id: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: string[];
  effort?: 'xs' | 's' | 'm' | 'l' | 'xl';
  personas?: StoryMapPersonaLink[];
}

interface StoryMapEpic {
  id: string;
  name: string;
  outcome: string;
  stories: StoryMapStory[];
}

interface StoryMapArtifact {
  version: string;
  label: string;
  personasReferenced: string[];
  epics: StoryMapEpic[];
}

export function storyMapToMarkdown(data: StoryMapArtifact): string {
  const lines: string[] = [];

  lines.push(`# ${data.label || 'Story Map'}`);
  lines.push('');

  if (data.personasReferenced && data.personasReferenced.length > 0) {
    lines.push(`**Personas:** ${data.personasReferenced.join(', ')}`);
    lines.push('');
  }

  if (data.epics && data.epics.length > 0) {
    for (const epic of data.epics) {
      lines.push(`## ${epic.name}`);
      lines.push('');
      lines.push(`${epic.outcome}`);
      lines.push('');

      if (epic.stories && epic.stories.length > 0) {
        for (const story of epic.stories) {
          lines.push(`### ${story.title}`);
          lines.push('');
          lines.push(`> As a **${story.asA}**, I want **${story.iWant}**, so that **${story.soThat}**.`);
          lines.push('');

          if (story.effort) {
            lines.push(`**Effort:** ${story.effort.toUpperCase()}`);
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
