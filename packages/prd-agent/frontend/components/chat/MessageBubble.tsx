import { User, Bot, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SmartMessageRenderer } from './SmartMessageRenderer';
import { PRD } from './PRDEditor';
import { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  onCopy: (content: string, messageId: string) => void;
  copied: boolean;
  onPRDUpdate?: (messageId: string, updatedPRD: PRD) => void;
}

export function MessageBubble({ message, onCopy, copied, onPRDUpdate }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start space-x-4 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
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
        }`}
      >
        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCopy(message.content, message.id)}
            className="absolute -left-12 top-0 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
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
