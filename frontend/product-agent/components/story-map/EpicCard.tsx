'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Target } from 'lucide-react';
import { StoryCard } from './StoryCard';
import type { StoryMapEpic } from './types';

interface EpicCardProps {
  epic: StoryMapEpic;
  index: number;
  defaultExpanded?: boolean;
}

const epicColors = [
  'border-l-blue-500',
  'border-l-purple-500',
  'border-l-green-500',
  'border-l-orange-500',
  'border-l-pink-500',
  'border-l-cyan-500'
];

export function EpicCard({ epic, index, defaultExpanded = false }: EpicCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const colorClass = epicColors[index % epicColors.length];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div className={`border rounded-lg bg-card border-l-4 ${colorClass}`}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full justify-between items-start p-4 hover:bg-muted/50 transition-colors text-left">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-gray-500" />
                <h3 className="font-semibold text-gray-900">{epic.name}</h3>
                <Badge variant="outline" className="text-xs">
                  {epic.stories?.length ?? 0} stories
                </Badge>
              </div>
              {!isExpanded && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                  {epic.outcome}
                </p>
              )}
            </div>
            <div className="ml-4 flex-shrink-0">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 pb-4 pt-3 space-y-4">
            <div>
              <p className="text-sm text-gray-600">{epic.outcome}</p>
            </div>

            {epic.stories && epic.stories.length > 0 && (
              <div className="space-y-3">
                {epic.stories.map((story) => (
                  <StoryCard key={story.id} story={story} />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
