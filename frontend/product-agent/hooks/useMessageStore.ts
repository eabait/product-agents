import { useCallback, useRef, useState, useEffect } from 'react';
import { Message, Conversation } from '../types';

/**
 * Derive a content-based key for message deduplication.
 * Returns null for messages that don't need dedup (user messages, non-JSON content).
 */
function getMessageDedupeKey(message: Message): string | null {
  if (message.role !== 'assistant') return null;

  try {
    const parsed = JSON.parse(message.content);

    // Artifacts have explicit IDs (research artifacts, etc.)
    if (parsed?.id && typeof parsed.id === 'string') {
      return `artifact:${parsed.id}`;
    }

    // Research/persona artifacts with kind field
    if (parsed?.kind === 'research' || parsed?.kind === 'persona') {
      const id = parsed.data?.id || parsed.id;
      if (id) return `${parsed.kind}:${id}`;
    }

    // PRDs identified by problemStatement (top-level)
    if (typeof parsed?.problemStatement === 'string') {
      return `prd:${parsed.problemStatement.slice(0, 500)}`;
    }

    // PRDs with sections structure (alternative format)
    // Check for sections.solution.solutionOverview as unique identifier
    if (parsed?.sections && typeof parsed.sections === 'object') {
      const solutionOverview = parsed.sections?.solution?.solutionOverview;
      if (typeof solutionOverview === 'string') {
        return `prd-sections:${solutionOverview.slice(0, 500)}`;
      }
      // Fallback: use targetUsers if solution not available
      const targetUsers = parsed.sections?.targetUsers?.targetUsers;
      if (Array.isArray(targetUsers) && targetUsers.length > 0) {
        return `prd-sections:${String(targetUsers[0]).slice(0, 300)}`;
      }
    }
  } catch {
    // Non-JSON content - no dedup key
  }

  return null;
}

export interface UseMessageStoreOptions {
  storageKey?: string;
  activeIdKey?: string;
}

export interface UseMessageStoreReturn {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  activeId: string | null;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  addMessage: (conversationId: string, message: Message) => boolean;
  updateConversation: (conversationId: string, updater: (conv: Conversation) => Conversation) => void;
  lockStream: (runId: string) => AbortController;
  unlockStream: (runId: string) => void;
  isStreamLocked: (runId: string) => boolean;
  clearSeenKeys: () => void;
}

export function useMessageStore(
  initialConversations: Conversation[] = [],
  options: UseMessageStoreOptions = {}
): UseMessageStoreReturn {
  const {
    storageKey = 'prd-agent-conversations',
    activeIdKey = 'prd-agent-active-conversation'
  } = options;

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Persistent dedup tracking across all function calls
  const seenMessageKeys = useRef(new Set<string>());

  // Stream execution lock - prevents concurrent streams on same runId
  const activeStreams = useRef(new Map<string, AbortController>());

  // Track if we've initialized from storage
  const hasInitialized = useRef(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    try {
      const savedConversations = localStorage.getItem(storageKey);
      const savedActiveId = localStorage.getItem(activeIdKey);

      if (savedConversations) {
        const parsed = JSON.parse(savedConversations) as Conversation[];
        setConversations(parsed);

        // Populate seenMessageKeys from existing messages
        parsed.forEach(conv => {
          conv.messages.forEach(msg => {
            const key = getMessageDedupeKey(msg);
            if (key) seenMessageKeys.current.add(key);
          });
        });
      }

      if (savedActiveId) {
        setActiveId(savedActiveId);
      }
    } catch (error) {
      console.warn('[useMessageStore] Failed to load from localStorage:', error);
    }
  }, [storageKey, activeIdKey]);

  // Persist to localStorage on changes
  useEffect(() => {
    if (!hasInitialized.current) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(conversations));
      if (activeId) {
        localStorage.setItem(activeIdKey, activeId);
      }
    } catch (error) {
      console.warn('[useMessageStore] Failed to save to localStorage:', error);
    }
  }, [conversations, activeId, storageKey, activeIdKey]);

  /**
   * Add a message to a conversation with deduplication.
   * Returns true if the message was added, false if it was a duplicate.
   */
  const addMessage = useCallback((conversationId: string, message: Message): boolean => {
    const key = getMessageDedupeKey(message);

    // Check if we've already seen this message
    if (key && seenMessageKeys.current.has(key)) {
      console.debug('[useMessageStore] Skipping duplicate:', key);
      return false;
    }

    // Track this key
    if (key) {
      seenMessageKeys.current.add(key);
    }

    // Add to state
    setConversations(prev => prev.map(conv =>
      conv.id === conversationId
        ? { ...conv, messages: [...conv.messages, message] }
        : conv
    ));

    return true;
  }, []);

  /**
   * Update a conversation with a custom updater function.
   * Use this for non-message updates or when you need full control.
   */
  const updateConversation = useCallback((
    conversationId: string,
    updater: (conv: Conversation) => Conversation
  ) => {
    setConversations(prev => prev.map(conv =>
      conv.id === conversationId ? updater(conv) : conv
    ));
  }, []);

  /**
   * Lock a stream for a runId, aborting any existing stream.
   * Returns an AbortController that can be used to cancel the stream.
   */
  const lockStream = useCallback((runId: string): AbortController => {
    // Abort existing stream if any
    const existing = activeStreams.current.get(runId);
    if (existing) {
      console.debug('[useMessageStore] Aborting existing stream for runId:', runId);
      existing.abort();
    }

    const controller = new AbortController();
    activeStreams.current.set(runId, controller);
    return controller;
  }, []);

  /**
   * Unlock/release a stream for a runId.
   */
  const unlockStream = useCallback((runId: string) => {
    activeStreams.current.delete(runId);
  }, []);

  /**
   * Check if a stream is currently locked for a runId.
   */
  const isStreamLocked = useCallback((runId: string): boolean => {
    return activeStreams.current.has(runId);
  }, []);

  /**
   * Clear all seen message keys. Useful for testing or resetting state.
   */
  const clearSeenKeys = useCallback(() => {
    seenMessageKeys.current.clear();
  }, []);

  return {
    conversations,
    setConversations,
    activeId,
    setActiveId,
    addMessage,
    updateConversation,
    lockStream,
    unlockStream,
    isStreamLocked,
    clearSeenKeys
  };
}

export { getMessageDedupeKey };
