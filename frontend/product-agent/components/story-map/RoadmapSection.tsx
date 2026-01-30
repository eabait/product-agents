'use client';

import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Lightbulb, Calendar } from 'lucide-react';
import type { StoryMapRoadmapNotes, StoryMapEpic } from './types';

interface RoadmapSectionProps {
  roadmapNotes?: StoryMapRoadmapNotes;
  epics: StoryMapEpic[];
}

function getEpicName(epicId: string, epics: StoryMapEpic[]): string {
  const epic = epics.find(e => e.id === epicId);
  return epic?.name ?? epicId;
}

export function RoadmapSection({ roadmapNotes, epics }: RoadmapSectionProps) {
  if (!roadmapNotes) return null;

  const hasReleaseRings = roadmapNotes.releaseRings && roadmapNotes.releaseRings.length > 0;
  const hasRisks = roadmapNotes.risks && roadmapNotes.risks.length > 0;
  const hasAssumptions = roadmapNotes.assumptions && roadmapNotes.assumptions.length > 0;

  if (!hasReleaseRings && !hasRisks && !hasAssumptions) return null;

  return (
    <div className="space-y-6 mt-8 pt-6 border-t">
      {hasReleaseRings && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Release Roadmap
          </h3>
          <div className="flex flex-wrap gap-4">
            {roadmapNotes.releaseRings!.map((ring, idx) => (
              <div
                key={idx}
                className="flex-1 min-w-[200px] border rounded-lg p-4 bg-gradient-to-br from-blue-50 to-white"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">{ring.label}</h4>
                  {ring.targetDate && (
                    <Badge variant="outline" className="text-xs">
                      {ring.targetDate}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {ring.epicIds.map((epicId, eidx) => (
                    <Badge key={eidx} variant="secondary" className="text-xs">
                      {getEpicName(epicId, epics)}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasRisks && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Risks
          </h3>
          <ul className="space-y-2">
            {roadmapNotes.risks!.map((risk, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-gray-700 pl-4 border-l-2 border-amber-400"
              >
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasAssumptions && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-500" />
            Assumptions
          </h3>
          <ul className="space-y-2">
            {roadmapNotes.assumptions!.map((assumption, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-gray-700 pl-4 border-l-2 border-blue-400"
              >
                <span>{assumption}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
