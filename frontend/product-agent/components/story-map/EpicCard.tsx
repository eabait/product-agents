'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Target, TrendingUp, Link2 } from 'lucide-react';
import { StoryCard } from './StoryCard';
import type { StoryMapEpic } from './types';

interface EpicCardProps {
  epic: StoryMapEpic;
  index: number;
  defaultExpanded?: boolean;
  onStoryClick?: (storyId: string) => void;
}

const epicColors = [
  'border-l-blue-500',
  'border-l-purple-500',
  'border-l-green-500',
  'border-l-orange-500',
  'border-l-pink-500',
  'border-l-cyan-500'
];

export function EpicCard({ epic, index, defaultExpanded = false, onStoryClick }: EpicCardProps) {
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
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {epic.stories?.length ?? 0} stories
                </Badge>
                {epic.metrics && epic.metrics.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {epic.metrics.length} metrics
                  </Badge>
                )}
                {epic.dependencies && epic.dependencies.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    <Link2 className="w-3 h-3 mr-1" />
                    {epic.dependencies.length} deps
                  </Badge>
                )}
              </div>
              {!isExpanded && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
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
              <h4 className="text-sm font-medium text-gray-700 mb-1">Outcome</h4>
              <p className="text-sm text-gray-600">{epic.outcome}</p>
            </div>

            {epic.dependencies && epic.dependencies.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Link2 className="w-4 h-4" />
                  Dependencies
                </h4>
                <div className="flex flex-wrap gap-1">
                  {epic.dependencies.map((dep, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {dep}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {epic.metrics && epic.metrics.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  Success Metrics
                </h4>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {epic.metrics.map((metric, idx) => (
                    <li key={idx}>{metric}</li>
                  ))}
                </ul>
              </div>
            )}

            {epic.stories && epic.stories.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">User Stories</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  {epic.stories.map((story) => (
                    <StoryCard
                      key={story.id}
                      story={story}
                      compact
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
