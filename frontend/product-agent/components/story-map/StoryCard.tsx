'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, CheckCircle2, Users } from 'lucide-react';
import type { StoryMapStory } from './types';

interface StoryCardProps {
  story: StoryMapStory;
}

const effortColors: Record<string, string> = {
  xs: 'bg-green-100 text-green-800',
  s: 'bg-blue-100 text-blue-800',
  m: 'bg-yellow-100 text-yellow-800',
  l: 'bg-orange-100 text-orange-800',
  xl: 'bg-red-100 text-red-800'
};

const effortLabels: Record<string, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL'
};

export function StoryCard({ story }: StoryCardProps) {
  const [showCriteria, setShowCriteria] = useState(false);

  return (
    <div className="bg-white border rounded-lg p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-gray-900 text-sm">{story.title}</h4>
        {story.effort && (
          <Badge className={`${effortColors[story.effort]} text-xs`}>
            {effortLabels[story.effort]}
          </Badge>
        )}
      </div>

      <p className="text-sm text-gray-600 mb-2">
        As a <span className="font-medium">{story.asA}</span>, I want{' '}
        <span className="font-medium">{story.iWant}</span>, so that{' '}
        <span className="font-medium">{story.soThat}</span>.
      </p>

      {story.personas && story.personas.length > 0 && (
        <div className="flex items-center gap-1 mb-2 flex-wrap">
          <Users className="w-3 h-3 text-gray-400" />
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
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{story.acceptanceCriteria.length} acceptance criteria</span>
            {showCriteria ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showCriteria && (
            <ul className="mt-2 space-y-1 pl-4">
              {story.acceptanceCriteria.map((criteria, idx) => (
                <li key={idx} className="text-xs text-gray-600 flex items-start gap-1">
                  <span className="text-green-600">✓</span>
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
