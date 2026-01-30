'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LayoutGrid, Users, Copy, Download } from 'lucide-react';
import { EpicCard } from './EpicCard';
import { RoadmapSection } from './RoadmapSection';
import { storyMapToMarkdown, copyStoryMapAsJson, downloadStoryMapMarkdown } from '@/lib/story-map-export-utils';
import type { StoryMapArtifact } from './types';

interface StoryMapArtifactViewProps {
  data: StoryMapArtifact;
  confidence?: number;
  readOnly?: boolean;
}

function getConfidenceBadgeColor(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
  if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

export function StoryMapArtifactView({ data, confidence, readOnly = true }: StoryMapArtifactViewProps) {
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
    <div className="prose prose-sm max-w-none p-6 space-y-6">
      {/* Header */}
      <div className="border-b-2 border-gray-300 pb-4 not-prose">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gray-900 flex items-center gap-2">
              <LayoutGrid className="w-8 h-8" />
              {data.label || 'Story Map'}
            </h1>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="outline">Story Map</Badge>
              {stats.personaCount > 0 && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {stats.personaCount} personas
                </Badge>
              )}
              <Badge variant="outline">{stats.epicCount} epics</Badge>
              <Badge variant="outline">{stats.storyCount} stories</Badge>
              {confidence !== undefined && (
                <Badge className={getConfidenceBadgeColor(confidence)}>
                  {Math.round(confidence * 100)}% Confidence
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyJson}>
              <Copy className="w-4 h-4 mr-1" />
              Copy JSON
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadMarkdown}>
              <Download className="w-4 h-4 mr-1" />
              Export MD
            </Button>
          </div>
        </div>
      </div>

      {/* Personas Referenced */}
      {data.personasReferenced && data.personasReferenced.length > 0 && (
        <div className="not-prose">
          <h2 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            <Users className="w-4 h-4" />
            Personas Referenced
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.personasReferenced.map((personaId, idx) => (
              <Badge key={idx} variant="secondary">
                {personaId}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Epics */}
      {data.epics && data.epics.length > 0 && (
        <div className="not-prose space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Epics</h2>
          <div className="space-y-4">
            {data.epics.map((epic, idx) => (
              <EpicCard
                key={epic.id}
                epic={epic}
                index={idx}
                defaultExpanded={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Roadmap */}
      <RoadmapSection roadmapNotes={data.roadmapNotes} epics={data.epics ?? []} />
    </div>
  );
}
