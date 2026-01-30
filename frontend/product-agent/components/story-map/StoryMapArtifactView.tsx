'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Users, Copy, Download } from 'lucide-react';
import { EpicCard } from './EpicCard';
import { storyMapToMarkdown, copyStoryMapAsJson, downloadStoryMapMarkdown } from '@/lib/story-map-export-utils';
import type { StoryMapArtifact } from './types';

interface StoryMapArtifactViewProps {
  data: StoryMapArtifact;
}

export function StoryMapArtifactView({ data }: StoryMapArtifactViewProps) {
  const stats = useMemo(() => {
    const epicCount = data.epics?.length ?? 0;
    const storyCount = data.epics?.reduce((sum, epic) => sum + (epic.stories?.length ?? 0), 0) ?? 0;
    const personaCount = data.personasReferenced?.length ?? 0;
    return { epicCount, storyCount, personaCount };
  }, [data]);

  const handleCopyJson = async () => {
    await copyStoryMapAsJson(data);
  };

  const handleDownloadMarkdown = () => {
    downloadStoryMapMarkdown(data);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between pb-3 border-b">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5" />
            {data.label || 'Story Map'}
          </h2>
          <div className="flex flex-wrap gap-2 mt-2">
            {stats.personaCount > 0 && (
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                <Users className="w-3 h-3" />
                {stats.personaCount} personas
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">{stats.epicCount} epics</Badge>
            <Badge variant="outline" className="text-xs">{stats.storyCount} stories</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopyJson}>
            <Copy className="w-3 h-3 mr-1" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadMarkdown}>
            <Download className="w-3 h-3 mr-1" />
            MD
          </Button>
        </div>
      </div>

      {/* Epics */}
      {data.epics && data.epics.length > 0 && (
        <div className="space-y-3">
          {data.epics.map((epic, idx) => (
            <EpicCard
              key={epic.id}
              epic={epic}
              index={idx}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
