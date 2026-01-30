import type { StoryMapArtifact } from '@/components/story-map/types';
import { downloadMarkdown, copyAsJson } from './export-utils';

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
  const success = await copyAsJson(data);
  if (!success) {
    console.error('Failed to copy story map to clipboard');
  }
}

export function downloadStoryMapMarkdown(data: StoryMapArtifact): void {
  const md = storyMapToMarkdown(data);
  const filename = `${(data.label || 'story-map').toLowerCase().replace(/\s+/g, '-')}.md`;
  downloadMarkdown(md, filename);
}
