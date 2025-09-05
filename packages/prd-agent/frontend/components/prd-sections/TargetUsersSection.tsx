'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, X, Users, RefreshCw } from 'lucide-react';
import { TargetUsersSection as TargetUsersSectionType } from '@/lib/prd-schema';

interface TargetUsersSectionProps {
  section?: TargetUsersSectionType;
  onChange: (updatedSection: TargetUsersSectionType) => void;
  onRegenerate?: () => void;
  readOnly?: boolean;
  confidence?: number;
  isRegenerating?: boolean;
}

export function TargetUsersSection({ 
  section, 
  onChange, 
  onRegenerate, 
  readOnly = false, 
  confidence,
  isRegenerating = false 
}: TargetUsersSectionProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  const targetUsers = section?.targetUsers || [];

  const updateTargetUser = useCallback((index: number, value: string) => {
    const updated = [...targetUsers];
    updated[index] = value;
    onChange({ targetUsers: updated });
  }, [targetUsers, onChange]);

  const addTargetUser = useCallback(() => {
    const updated = [...targetUsers, ''];
    onChange({ targetUsers: updated });
    setEditingIndex(updated.length - 1);
  }, [targetUsers, onChange]);

  const removeTargetUser = useCallback((index: number) => {
    const updated = targetUsers.filter((_, i) => i !== index);
    onChange({ targetUsers: updated });
  }, [targetUsers, onChange]);

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Target Users</h3>
        {confidence !== undefined && (
          <span className="text-xs bg-muted px-2 py-1 rounded-full">
            {Math.round(confidence * 100)}% confidence
          </span>
        )}
      </div>
      {onRegenerate && !readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
          {isRegenerating ? 'Regenerating...' : 'Regenerate'}
        </Button>
      )}
    </div>
  );

  const renderTargetUsers = () => (
    <div className="space-y-3">
      {targetUsers.map((user, index) => (
        <div key={index} className="flex gap-2">
          {readOnly ? (
            <div className="flex-1 p-3 bg-muted rounded-md text-sm">
              {user || `Target User ${index + 1}`}
            </div>
          ) : (
            <>
              <Input
                value={user}
                onChange={(e) => updateTargetUser(index, e.target.value)}
                placeholder={`Target user persona ${index + 1}`}
                className="flex-1"
                onFocus={() => setEditingIndex(index)}
                onBlur={() => setEditingIndex(null)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTargetUser(index)}
                className="px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ))}
      
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={addTargetUser}
          className="w-full mt-3"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Target User
        </Button>
      )}
      
      {targetUsers.length === 0 && !readOnly && (
        <div className="text-sm text-muted-foreground italic p-4 text-center border-2 border-dashed border-muted rounded-lg">
          No target users defined. Click &quot;Add Target User&quot; to specify who will use this product.
        </div>
      )}
    </div>
  );

  if (!section && readOnly) {
    return null;
  }

  return (
    <Card className="p-6">
      {renderHeader()}
      {renderTargetUsers()}
      
      {/* Help text */}
      {!readOnly && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>Tip:</strong> Be specific about user types, their context, and needs. 
            Example: &quot;Small business owners managing 5-15 employees who struggle with manual project tracking&quot;
          </p>
        </div>
      )}
    </Card>
  );
}