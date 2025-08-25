import { User, Bot, Copy, Check, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SmartMessageRenderer } from './SmartMessageRenderer';
import { PRD } from './PRDEditor';
import { Message } from '../../types';
import { contextStorage } from '@/lib/context-storage';
import { useState, useEffect } from 'react';

interface MessageBubbleProps {
  message: Message;
  onCopy: (content: string, messageId: string) => void;
  copied: boolean;
  onPRDUpdate?: (messageId: string, updatedPRD: PRD) => void;
}

export function MessageBubble({ message, onCopy, copied, onPRDUpdate }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [isSelectedForContext, setIsSelectedForContext] = useState(false);

  // Check if this message is selected for context
  useEffect(() => {
    const selectedMessages = contextStorage.getSelectedMessages();
    const selectedMessage = selectedMessages.find(m => m.id === message.id);
    setIsSelectedForContext(!!selectedMessage?.isSelected);
  }, [message.id]);

  const handleContextToggle = () => {
    // Add message to selectable messages if not already there
    contextStorage.addSelectableMessage({
      id: message.id,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp || new Date()
    });
    
    // Toggle selection
    const newState = contextStorage.toggleMessageSelection(message.id);
    setIsSelectedForContext(newState);
  };

  return (
    <div className={`group flex items-start space-x-4 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
        {isUser ? (
          <div className="bg-foreground rounded-full p-1.5">
            <User className="w-4 h-4 text-background" />
          </div>
        ) : (
          <div className="bg-orange-500 rounded-full p-1.5">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Bubble */}
      <div
        className={`relative max-w-[80%] p-4 rounded-2xl text-base leading-7 ${
          isUser
            ? 'bg-primary text-white'
            : 'bg-muted text-foreground'
        } ${isSelectedForContext ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`}
      >
        {/* Context selection checkbox */}
        <div className={`absolute ${isUser ? '-right-12' : '-left-12'} top-0 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center">
                <Checkbox
                  checked={isSelectedForContext}
                  onCheckedChange={handleContextToggle}
                  className="h-4 w-4"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSelectedForContext ? 'Remove from context' : 'Add to context'}</p>
            </TooltipContent>
          </Tooltip>
          <Database className="w-3 h-3 text-muted-foreground" />
        </div>

        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCopy(message.content, message.id)}
            className={`absolute -left-12 ${isSelectedForContext ? 'top-8' : 'top-0'} opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8`}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </Button>
        )}

        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <SmartMessageRenderer 
            content={message.content} 
            messageId={message.id}
            onPRDUpdate={onPRDUpdate}
          />
        )}
      </div>
    </div>
  );
}
