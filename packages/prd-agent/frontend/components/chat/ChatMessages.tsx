import { motion } from 'framer-motion';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { PRD } from './PRDEditor';
import { Message } from '../../types';

interface ChatMessagesProps {
  messages: Message[];
  isProcessing: boolean;
  copied: string | null;
  onCopy: (content: string, messageId: string) => void;
  onPRDUpdate?: (messageId: string, updatedPRD: PRD) => void;
}

export function ChatMessages({
  messages,
  isProcessing,
  copied,
  onCopy,
  onPRDUpdate,
}: ChatMessagesProps) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-4 space-y-6">
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
          />
        </motion.div>
      ))}

      {isProcessing && <TypingIndicator />}
    </div>
  );
}
