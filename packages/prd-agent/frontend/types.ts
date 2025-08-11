export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
    confidence?: number;
  };
}

export type Conversation = { 
  id: string; 
  title: string; 
  messages: Message[]; 
  createdAt: string;
}

// PRD-specific types
export type { PRD, SuccessMetric } from '@/lib/prd-schema';