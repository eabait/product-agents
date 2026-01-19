import { motion } from 'framer-motion';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { ProgressIndicator } from './ProgressIndicator';
import { NewPRD } from '@/lib/prd-schema';
import { Message, type RunProgressCard } from '../../types';
import { useState, useEffect, useMemo } from 'react';
import { PlanReview } from '@/components/plan-review';
import { ResearchPlanCard } from '@/components/research/ResearchPlanCard';

interface ChatMessagesProps {
  messages: Message[];
  isProcessing: boolean;
  copied: string | null;
  onCopy: (_content: string, _messageId: string) => void;
  onPRDUpdate?: (_messageId: string, _updatedPRD: NewPRD) => void;
  onResearchPlanAction?: (_action: 'approve' | 'reject', _plan: any) => void;
  onPlanApproval?: (_params: {
    runId: string;
    cardId: string;
    approved: boolean;
    feedback?: string;
  }) => void;
  onSubagentApproval?: (_params: {
    runId: string;
    cardId: string;
    stepId: string;
    subagentId: string;
    approved: boolean;
    feedback?: string;
  }) => void;
  approvalLoadingByRun?: Record<string, boolean>;
  approvalErrorsByRun?: Record<string, string | null>;
  progressCards?: RunProgressCard[];
  isStreaming?: boolean;
}

export function ChatMessages({
  messages,
  isProcessing,
  copied,
  onCopy,
  onPRDUpdate,
  onResearchPlanAction,
  onPlanApproval,
  onSubagentApproval,
  approvalLoadingByRun = {},
  approvalErrorsByRun = {},
  progressCards = [],
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

  const progressCardsByMessage = useMemo(() => {
    const map = new Map<string, RunProgressCard[]>();
    const FALLBACK_KEY = '__tail__';
    progressCards.forEach(card => {
      const key = card.messageId ?? FALLBACK_KEY;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(card);
    });
    return {
      map,
      fallbackKey: FALLBACK_KEY,
    };
  }, [progressCards]);
  
  return (
    <div className="max-w-4xl mx-auto px-6 py-4 space-y-6">
      {messages.map((message, _index) => (
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
              onResearchPlanAction={onResearchPlanAction}
              isExpanded={expandedPRDs.has(message.id)}
              onToggleExpanded={handleToggleExpanded}
            />
          </motion.div>

          {(progressCardsByMessage.map.get(message.id) ?? []).map(card => (
            <motion.div
              key={`${card.id}-${card.status}`}
              className="mt-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <ProgressIndicator 
                events={card.events}
                plan={card.plan}
                nodeStates={card.nodeStates}
                isActive={card.status === 'active'}
                status={card.status}
                startedAt={card.startedAt}
                completedAt={card.completedAt}
              />
              {card.status === 'pending-approval' && card.approvalPlan && card.runId && (() => {
                const runId = card.runId;
                return (
                  <div className="mt-4">
                    <PlanReview
                      plan={card.approvalPlan}
                      onApprove={() =>
                        onPlanApproval?.({ runId, cardId: card.id, approved: true })
                      }
                      onReject={feedback =>
                        onPlanApproval?.({
                          runId,
                          cardId: card.id,
                          approved: false,
                          feedback
                        })
                      }
                      isLoading={Boolean(approvalLoadingByRun[runId])}
                      error={approvalErrorsByRun[runId] ?? undefined}
                    />
                  </div>
                );
              })()}
              {card.status === 'blocked-subagent' && card.blockedSubagent && card.runId && (() => {
                const runId = card.runId;
                const blocked = card.blockedSubagent;
                return (
                  <div className="mt-4">
                    <ResearchPlanCard
                      plan={blocked.plan as any}
                      status="awaiting-plan-confirmation"
                      onApprove={() => {
                        onSubagentApproval?.({
                          runId,
                          cardId: card.id,
                          stepId: blocked.stepId,
                          subagentId: blocked.subagentId,
                          approved: true
                        });
                      }}
                      onReject={() => {
                        onSubagentApproval?.({
                          runId,
                          cardId: card.id,
                          stepId: blocked.stepId,
                          subagentId: blocked.subagentId,
                          approved: false
                        });
                      }}
                      isProcessing={Boolean(approvalLoadingByRun[runId])}
                    />
                  </div>
                );
              })()}
            </motion.div>
          ))}
        </div>
      ))}

      {(progressCardsByMessage.map.get(progressCardsByMessage.fallbackKey) ?? []).map(card => (
        <motion.div
          key={`${card.id}-${card.status}`}
          className="mt-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <ProgressIndicator
            events={card.events}
            plan={card.plan}
            nodeStates={card.nodeStates}
            isActive={card.status === 'active'}
            status={card.status}
            startedAt={card.startedAt}
            completedAt={card.completedAt}
          />
          {card.status === 'pending-approval' && card.approvalPlan && card.runId && (() => {
            const runId = card.runId;
            return (
              <div className="mt-4">
                <PlanReview
                  plan={card.approvalPlan}
                  onApprove={() =>
                    onPlanApproval?.({ runId, cardId: card.id, approved: true })
                  }
                  onReject={feedback =>
                    onPlanApproval?.({
                      runId,
                      cardId: card.id,
                      approved: false,
                      feedback
                    })
                  }
                  isLoading={Boolean(approvalLoadingByRun[runId])}
                  error={approvalErrorsByRun[runId] ?? undefined}
                />
              </div>
            );
          })()}
          {card.status === 'blocked-subagent' && card.blockedSubagent && card.runId && (() => {
            const runId = card.runId;
            const blocked = card.blockedSubagent;
            return (
              <div className="mt-4">
                <ResearchPlanCard
                  plan={blocked.plan as any}
                  status="awaiting-plan-confirmation"
                  onApprove={() => {
                    onSubagentApproval?.({
                      runId,
                      cardId: card.id,
                      stepId: blocked.stepId,
                      subagentId: blocked.subagentId,
                      approved: true
                    });
                  }}
                  onReject={() => {
                    onSubagentApproval?.({
                      runId,
                      cardId: card.id,
                      stepId: blocked.stepId,
                      subagentId: blocked.subagentId,
                      approved: false
                    });
                  }}
                  isProcessing={Boolean(approvalLoadingByRun[runId])}
                />
              </div>
            );
          })()}
        </motion.div>
      ))}

      {isProcessing && !isStreaming && <TypingIndicator />}
    </div>
  );
}
