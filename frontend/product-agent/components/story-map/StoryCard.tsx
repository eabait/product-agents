'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, CheckCircle2, Users } from 'lucide-react';
import type { StoryMapStory } from './types';

interface StoryCardProps {
  story: StoryMapStory;
  compact?: boolean;
}

const effortColors: Record<string, string> = {
  xs: 'bg-green-100 text-green-800 border-green-200',
  s: 'bg-blue-100 text-blue-800 border-blue-200',
  m: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  l: 'bg-orange-100 text-orange-800 border-orange-200',
  xl: 'bg-red-100 text-red-800 border-red-200'
};

const effortLabels: Record<string, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL'
};

function getConfidenceBadgeColor(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
  if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

export function StoryCard({ story, compact = false }: StoryCardProps) {
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-gray-900">{story.title}</h4>
        <div className="flex items-center gap-1 flex-shrink-0">
          {story.effort && (
            <Badge className={`${effortColors[story.effort]} text-xs`}>
              {effortLabels[story.effort]}
            </Badge>
          )}
          {story.confidence !== undefined && (
            <Badge className={`${getConfidenceBadgeColor(story.confidence)} text-xs`}>
              {Math.round(story.confidence * 100)}%
            </Badge>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-700 mb-3 italic">
        As a <span className="font-medium not-italic">{story.asA}</span>, I want{' '}
        <span className="font-medium not-italic">{story.iWant}</span>, so that{' '}
        <span className="font-medium not-italic">{story.soThat}</span>.
      </p>

      {story.personas && story.personas.length > 0 && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <Users className="w-3 h-3 text-gray-500" />
          {story.personas.map((persona, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {persona.personaId}
            </Badge>
          ))}
        </div>
      )}

      {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
        <div>
          <button
            onClick={() => setShowCriteria(!showCriteria)}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{story.acceptanceCriteria.length} acceptance criteria</span>
            {showCriteria ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showCriteria && (
            <ul className="mt-2 space-y-1 pl-5">
              {story.acceptanceCriteria.map((criteria, idx) => (
                <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-green-600 mt-0.5">&#10003;</span>
                  <span>{criteria}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
