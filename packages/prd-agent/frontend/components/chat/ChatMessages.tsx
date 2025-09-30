import { motion } from 'framer-motion';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ProgressIndicator, type ProgressEvent } from './ProgressIndicator';
import { NewPRD } from '@/lib/prd-schema';
import { Message } from '../../types';
import { useState, useEffect, useMemo } from 'react';

interface ChatMessagesProps {
  messages: Message[];
  isProcessing: boolean;
  copied: string | null;
  onCopy: (_content: string, _messageId: string) => void;
  onPRDUpdate?: (_messageId: string, _updatedPRD: NewPRD) => void;
  progressEvents?: ProgressEvent[];
  isStreaming?: boolean;
}

export function ChatMessages({
  messages,
  isProcessing,
  copied,
  onCopy,
  onPRDUpdate,
  progressEvents = [],
  isStreaming = false,
}: ChatMessagesProps) {
  const [expandedPRDs, setExpandedPRDs] = useState<Set<string>>(new Set());

  // Helper function to check if a message contains a PRD
  const isPRDMessage = (message: Message) => {
    if (message.role === 'user') return false;
    try {
      const parsed = JSON.parse(message.content);
      return parsed && typeof parsed === 'object' && typeof parsed.problemStatement === 'string';
    } catch {
      return false;
    }
  };

  // Find the last PRD message ID
  const lastPRDMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (isPRDMessage(messages[i])) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages]);

  // Auto-expand the last PRD message when it changes
  useEffect(() => {
    if (lastPRDMessageId) {
      setExpandedPRDs(_ => {
        const newSet = new Set<string>();
        newSet.add(lastPRDMessageId);
        return newSet;
      });
    }
  }, [lastPRDMessageId]);

  const handleToggleExpanded = (messageId: string) => {
    setExpandedPRDs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  // Find the index where we should insert the progress indicator
  // It should be after the last user message when streaming
  const lastUserMessageIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return i;
      }
    }
    return -1;
  }, [messages]);

  // Determine if we should show progress indicator and where
  const shouldShowProgress = isStreaming && (progressEvents.length > 0 || isProcessing);
  
  return (
    <div className="max-w-4xl mx-auto px-6 py-4 space-y-6">
      {messages.map((message, index) => (
        <div key={message.id}>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MessageBubble
              message={message}
              onCopy={onCopy}
              copied={copied === message.id}
              onPRDUpdate={onPRDUpdate}
              isExpanded={expandedPRDs.has(message.id)}
              onToggleExpanded={handleToggleExpanded}
            />
          </motion.div>
          
          {/* Insert progress indicator after last user message when streaming */}
          {shouldShowProgress && index === lastUserMessageIndex && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ProgressIndicator 
                events={progressEvents}
                isActive={isProcessing}
                defaultCollapsed={true}
              />
            </motion.div>
          )}
        </div>
      ))}

      {/* Fallback: show progress indicator at the end if no user messages exist */}
      {shouldShowProgress && lastUserMessageIndex === -1 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ProgressIndicator 
            events={progressEvents}
            isActive={isProcessing}
            defaultCollapsed={true}
          />
        </motion.div>
      )}

      {isProcessing && !isStreaming && <TypingIndicator />}
    </div>
  );
}
