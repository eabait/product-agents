import { motion } from 'framer-motion';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { NewPRD } from '@/lib/prd-schema';
import { Message } from '../../types';
import { useState, useEffect, useMemo } from 'react';

interface ChatMessagesProps {
  messages: Message[];
  isProcessing: boolean;
  copied: string | null;
  onCopy: (_content: string, _messageId: string) => void;
  onPRDUpdate?: (_messageId: string, _updatedPRD: NewPRD) => void;
}

export function ChatMessages({
  messages,
  isProcessing,
  copied,
  onCopy,
  onPRDUpdate,
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
  return (
    <div className="max-w-4xl mx-auto px-6 py-4 space-y-6">
      {messages.map((message) => (
        <motion.div
          key={message.id}
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
      ))}

      {isProcessing && <TypingIndicator />}
    </div>
  );
}
