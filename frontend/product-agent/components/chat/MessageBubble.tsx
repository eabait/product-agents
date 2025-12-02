import { User, Bot, Database } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SmartMessageRenderer } from './SmartMessageRenderer';
import { NewPRD } from '@/lib/prd-schema';
import { Message } from '../../types';
import { contextStorage } from '@/lib/context-storage';
import { createMessageId } from '@/lib/context-types';
import { useState, useEffect } from 'react';

interface MessageBubbleProps {
  message: Message;
  onCopy: (_content: string, _messageId: string) => void;
  copied: boolean;
  onPRDUpdate?: (_messageId: string, _updatedPRD: NewPRD) => void;
  isExpanded?: boolean;
  onToggleExpanded?: (_messageId: string) => void;
}

// eslint-disable-next-line no-unused-vars
export function MessageBubble({ message, onCopy, copied, onPRDUpdate, isExpanded, onToggleExpanded }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [isSelectedForContext, setIsSelectedForContext] = useState(false);

  // Check if this message is selected for context
  useEffect(() => {
    const selectedMessages = contextStorage.getSelectedMessages();
    const messageId = createMessageId(message.id);
    const selectedMessage = selectedMessages.find(m => m.id === messageId);
    setIsSelectedForContext(!!selectedMessage?.isSelected);
  }, [message.id]);

  const handleContextToggle = () => {
    // Only handle user messages for context selection
    if (message.role === 'user') {
      try {
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
        
        // Force refresh of selection state to ensure UI stays in sync
        setTimeout(() => {
          const selectedMessages = contextStorage.getSelectedMessages();
          const messageId = createMessageId(message.id);
          const selectedMessage = selectedMessages.find(m => m.id === messageId);
          const finalState = !!selectedMessage?.isSelected;
          setIsSelectedForContext(finalState);
        }, 0);
        
      } catch (error) {
        console.error('Error toggling message selection:', error);
        // Revert to previous state on error
        setIsSelectedForContext(!isSelectedForContext);
      }
    }
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

      {/* Context Checkbox - positioned to the right of avatar for user messages */}
      {isUser && (
        <div className="flex items-start pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col items-center gap-1">
                <Checkbox
                  checked={isSelectedForContext}
                  onCheckedChange={handleContextToggle}
                  className="h-4 w-4"
                />
                <Database className="w-3 h-3 text-muted-foreground" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSelectedForContext ? 'Remove from context' : 'Add to context'}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Bubble */}
      <div
        className={`max-w-[80%] p-4 rounded-2xl text-base leading-7 ${
          isUser
            ? 'bg-primary text-white'
            : 'bg-muted text-foreground'
        } ${isSelectedForContext ? 'ring-2 ring-blue-500 ring-opacity-50' : ''}`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (         
          <SmartMessageRenderer 
            content={message.content} 
            messageId={message.id}
            onPRDUpdate={onPRDUpdate}
            isExpanded={isExpanded}
            onToggleExpanded={onToggleExpanded}
          />
        )}
      </div>
    </div>
  );
}
