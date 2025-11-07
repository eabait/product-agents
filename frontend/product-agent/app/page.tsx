"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { UsageSummary } from "@product-agents/agent-core";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppStateProvider, useModelContext } from "@/contexts/AppStateProvider";
import { ChatMessages } from "@/components/chat/ChatMessages";
import {
  Menu,
  Plus,
  MessageCircle,
  Send,
  Settings,
  Loader,
  Edit3,
  Check,
  X,
  Trash2,
  Database,
} from "lucide-react";
import { Conversation, Message, AgentMetadata, AgentSettingsState, SubAgentSettingsMap } from "@/types";
import { NewPRD } from "@/lib/prd-schema";
import { ContextPanel } from "@/components/context";
import { ContextUsageIndicator } from "@/components/context/ContextUsageIndicator";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { type ProgressEvent } from "@/components/chat/ProgressIndicator";
import { contextStorage } from "@/lib/context-storage";
import { buildEnhancedContextPayload, getContextSummary } from "@/lib/context-utils";
import { getRun, startRun, streamRun } from "@/lib/run-client";
import { 
  UI_DIMENSIONS, 
  VALIDATION_LIMITS, 
  TimingSettings
} from "@/lib/ui-constants";

type RuntimeOverrides = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
};

function buildSubAgentSettings(
  metadata: AgentMetadata | null,
  defaults: SubAgentSettingsMap | undefined,
  saved: SubAgentSettingsMap | undefined,
  fallback: {
    model: string;
    temperature: number;
    maxTokens: number;
    apiKey?: string;
  }
): SubAgentSettingsMap {
  const subAgents = metadata?.subAgents || [];

  if (subAgents.length === 0) {
    const source = saved || defaults || {};
    return Object.entries(source).reduce<SubAgentSettingsMap>((acc, [key, value]) => {
      acc[key] = { ...value };
      return acc;
    }, {});
  }

  return subAgents.reduce<SubAgentSettingsMap>((acc, subAgent) => {
    const defaultEntry: RuntimeOverrides = defaults?.[subAgent.id] ?? subAgent.defaultSettings ?? {};
    const savedEntry: RuntimeOverrides = saved?.[subAgent.id] ?? {};

    acc[subAgent.id] = {
      model: savedEntry.model ?? defaultEntry.model ?? fallback.model,
      temperature: savedEntry.temperature ?? defaultEntry.temperature ?? fallback.temperature,
      maxTokens: savedEntry.maxTokens ?? defaultEntry.maxTokens ?? fallback.maxTokens,
      apiKey: savedEntry.apiKey ?? defaultEntry.apiKey ?? fallback.apiKey,
    };

    return acc;
  }, {} as SubAgentSettingsMap);
}

// Streaming configuration constants
const STREAM_TIMEOUT_MS = 300000; // 5 minutes
// const STREAM_RETRY_COUNT = 3; // Reserved for future retry implementation
// const STREAM_RETRY_DELAY_MS = 1000; // Reserved for future retry implementation
// Enhanced model interface from OpenRouter

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const formatCostValue = (amount: number, currency: string): string => {
  if (!Number.isFinite(amount)) return '';
  const normalizedCurrency = currency && currency.length > 0 ? currency.toUpperCase() : 'USD';
  const precision = amount >= 1 ? 2 : 4;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    }).format(amount);
  } catch {
    return `${normalizedCurrency} ${amount.toFixed(precision)}`;
  }
};

type ConversationCostEntry = {
  id: string;
  label: string;
  cost: number;
  currency: string;
  source: 'provider' | 'estimated';
};

type ConversationCostSummary = {
  total: number;
  currency: string;
  entries: ConversationCostEntry[];
  hasEstimated: boolean;
};


function PRDAgentPageContent() {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Use reactive contexts
  const { models, setModels, updateModelFromId } = useModelContext();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Settings state  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AgentSettingsState>({
    model: "anthropic/claude-3-7-sonnet", // Will be updated with agent defaults
    temperature: 0.7, // Will be updated with agent defaults
    maxTokens: 8000, // Will be updated with agent defaults
    apiKey: undefined,
    streaming: true, // Enable streaming by default
    subAgentSettings: {},
    artifactTypes: ['prd']
  });
  const [agentMetadata, setAgentMetadata] = useState<AgentMetadata | null>(null);
  
  // Streaming state
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);

  const activeArtifactType = settings.artifactTypes?.[0] ?? 'prd'
  const isPersonaMode = activeArtifactType === 'persona'
  // Derive streaming state from settings (persona runs are batch-only)
  const isStreamingEnabled = settings.streaming !== false && !isPersonaMode;
  
  // Context panel state
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSummary, setContextSummary] = useState<string>('');

  // Title editing state
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");

  // Delete confirmation state
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

  // track initialization so we don't run sync effects before we've loaded from localStorage
  const isInitializedRef = useRef(false);
  const initialSettingsRef = useRef(settings);

  const pricingByModel = React.useMemo(() => {
    const map = new Map<string, { promptPerToken: number; completionPerToken: number }>();
    models.forEach(model => {
      map.set(model.id, {
        promptPerToken: model.pricing.promptPerToken ?? 0,
        completionPerToken: model.pricing.completionPerToken ?? 0
      });
    });
    return map;
  }, [models]);

  const buildAssistantMetadata = React.useCallback(
    (usageSummary: any | null | undefined, modelId?: string | null, rawMetadata?: any): Message['metadata'] | undefined => {
      const metadata: Message['metadata'] = {};

      if (modelId) {
        metadata.model = modelId;
      }

      const confidenceLevel = rawMetadata?.overall_confidence?.level;
      if (confidenceLevel) {
        metadata.confidence =
          confidenceLevel === 'high'
            ? 0.9
            : confidenceLevel === 'medium'
              ? 0.7
              : confidenceLevel === 'low'
                ? 0.4
                : metadata.confidence;
      }

      const usage = usageSummary || rawMetadata?.usage;
      if (usage) {
        const promptTokens = coerceNumber(
          usage.promptTokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.input_tokens ?? usage.inputTextTokens ?? usage.input_text_tokens
        );
        const completionTokens = coerceNumber(
          usage.completionTokens ?? usage.completion_tokens ?? usage.outputTokens ?? usage.output_tokens ?? usage.outputTextTokens ?? usage.output_text_tokens
        );
        let totalTokens = coerceNumber(
          usage.totalTokens ?? usage.total_tokens ?? usage.tokens ?? usage.token_count
        );

        if (totalTokens === undefined && (promptTokens !== undefined || completionTokens !== undefined)) {
          totalTokens = (promptTokens || 0) + (completionTokens || 0);
        }

        const promptCost = coerceNumber(
          usage.promptCost ?? usage.prompt_cost ?? usage.cost?.prompt ?? usage.prompt_cost_usd ?? usage.prompt?.cost
        );
        const completionCost = coerceNumber(
          usage.completionCost ?? usage.completion_cost ?? usage.cost?.completion ?? usage.completion_cost_usd ?? usage.completion?.cost
        );
        let totalCost = coerceNumber(
          usage.totalCost ?? usage.total_cost ?? usage.cost?.total ?? usage.cost_usd ?? usage.total_cost_usd
        );

        const rawCurrency =
          usage.currency ??
          usage.cost?.currency ??
          usage.usage?.currency ??
          rawMetadata?.currency;
        const normalizedCurrency =
          typeof rawCurrency === 'string' && rawCurrency.trim().length > 0
            ? rawCurrency.trim().toUpperCase()
            : undefined;

        const entries = Array.isArray(usage.entries)
          ? (usage.entries as UsageSummary['entries'])
          : [];

        const normalizedUsage: UsageSummary = {
          promptTokens,
          completionTokens,
          totalTokens,
          promptCost,
          completionCost,
          totalCost,
          currency: normalizedCurrency,
          entries
        };

        let costSource: 'provider' | 'estimated' | undefined;

        if (typeof totalCost === 'number' && Number.isFinite(totalCost)) {
          costSource = 'provider';
        } else if (typeof promptCost === 'number' || typeof completionCost === 'number') {
          totalCost = (promptCost || 0) + (completionCost || 0);
          normalizedUsage.totalCost = totalCost;
          costSource = 'provider';
        } else {
          const pricing = modelId ? pricingByModel.get(modelId) : undefined;
          if (pricing) {
            const promptRate = pricing.promptPerToken ?? 0;
            const completionRate = pricing.completionPerToken ?? 0;
            if ((promptTokens || completionTokens) && (promptRate || completionRate)) {
              const estimatedCost =
                (promptTokens || 0) * promptRate +
                (completionTokens || 0) * completionRate;
              if (Number.isFinite(estimatedCost) && estimatedCost > 0) {
                totalCost = estimatedCost;
                normalizedUsage.promptCost = normalizedUsage.promptCost ?? (promptTokens || 0) * promptRate;
                normalizedUsage.completionCost = normalizedUsage.completionCost ?? (completionTokens || 0) * completionRate;
                normalizedUsage.totalCost = estimatedCost;
                costSource = 'estimated';
              }
            }
          }
        }

        if (!normalizedUsage.currency) {
          normalizedUsage.currency = 'USD';
        }

        metadata.usage = normalizedUsage;

        if (typeof totalTokens === 'number') {
          metadata.tokens = totalTokens;
          metadata.totalTokens = totalTokens;
        }
        if (typeof promptTokens === 'number') {
          metadata.promptTokens = promptTokens;
        }
        if (typeof completionTokens === 'number') {
          metadata.completionTokens = completionTokens;
        }
        if (typeof totalCost === 'number' && Number.isFinite(totalCost)) {
          metadata.cost = totalCost;
          metadata.currency = normalizedUsage.currency || 'USD';
          metadata.costSource = costSource || 'provider';
        }
      }

      return Object.keys(metadata).length > 0 ? metadata : undefined;
    },
    [pricingByModel]
  );

  // No cleanup needed since we handle streaming directly in the fetch response
  

  // Computed helpers for working with active conversation
  const activeConversation = conversations.find(c => c.id === activeId);
  const activeMessages = React.useMemo(() => activeConversation?.messages || [], [activeConversation]);

  const conversationCost = React.useMemo<ConversationCostSummary | null>(() => {
    if (!activeConversation) {
      return null;
    }

    let assistantIndex = 0;
    const entries: ConversationCostEntry[] = [];

    for (const message of activeConversation.messages) {
      if (message.role !== 'assistant') continue;
      assistantIndex += 1;
      const metadata = message.metadata;
      if (!metadata) continue;

      const usage = metadata.usage;
      const currencyRaw = metadata.currency || usage?.currency || 'USD';
      const entryCurrency =
        typeof currencyRaw === 'string' && currencyRaw.trim().length > 0
          ? currencyRaw.trim().toUpperCase()
          : 'USD';

      let cost = coerceNumber(metadata.cost);
      let source: 'provider' | 'estimated' | undefined =
        metadata.costSource === 'provider' || metadata.costSource === 'estimated'
          ? metadata.costSource
          : undefined;

      if ((cost === undefined || !Number.isFinite(cost)) && usage) {
        const usageTotalCost = coerceNumber(usage.totalCost);
        if (usageTotalCost !== undefined) {
          cost = usageTotalCost;
          source = 'provider';
        } else {
          const usagePromptCost = coerceNumber(usage.promptCost);
          const usageCompletionCost = coerceNumber(usage.completionCost);
          if (usagePromptCost !== undefined || usageCompletionCost !== undefined) {
            cost = (usagePromptCost || 0) + (usageCompletionCost || 0);
            source = 'provider';
          }
        }
      }

      if (cost === undefined || !Number.isFinite(cost)) {
        const promptTokens = coerceNumber(metadata.promptTokens ?? usage?.promptTokens);
        const completionTokens = coerceNumber(metadata.completionTokens ?? usage?.completionTokens);
        const modelId = metadata.model || settings.model || null;
        const pricing = modelId ? pricingByModel.get(modelId) : undefined;
        if (pricing && (promptTokens || completionTokens)) {
          const estimatedCost =
            (promptTokens || 0) * (pricing.promptPerToken ?? 0) +
            (completionTokens || 0) * (pricing.completionPerToken ?? 0);
          if (Number.isFinite(estimatedCost) && estimatedCost > 0) {
            cost = estimatedCost;
            source = 'estimated';
          }
        }
      }

      if (cost === undefined || !Number.isFinite(cost)) {
        continue;
      }

      const usageLabels =
        Array.isArray(usage?.entries) && usage.entries.length > 0
          ? usage.entries.map((entry: any) => entry?.name).filter(Boolean)
          : [];

      const label = usageLabels.length > 0 ? usageLabels.join(', ') : `Assistant #${assistantIndex}`;

      entries.push({
        id: message.id,
        label,
        cost,
        currency: entryCurrency,
        source: source || 'provider'
      });
    }

    if (entries.length === 0) {
      return null;
    }

    const canonicalCurrency = entries[0].currency;
    const total = entries
      .filter(entry => entry.currency === canonicalCurrency)
      .reduce((sum, entry) => sum + entry.cost, 0);

    if (!Number.isFinite(total)) {
      return null;
    }

    return {
      total,
      currency: canonicalCurrency,
      entries,
      hasEstimated: entries.some(entry => entry.source === 'estimated')
    };
  }, [activeConversation?.messages, pricingByModel, settings.model]);

  const formattedConversationCost = React.useMemo(() => {
    if (!conversationCost) {
      return null;
    }

    const formatted = formatCostValue(conversationCost.total, conversationCost.currency);
    if (!formatted) {
      return null;
    }

    return `${formatted}${conversationCost.hasEstimated ? ' (est.)' : ''}`;
  }, [conversationCost]);


  // Helper to update the active conversation
  const updateActiveConversation = (updater: (_conv: Conversation) => Conversation) => {
    if (!activeId) return;
    setConversations(prev => 
      prev.map(c => c.id === activeId ? updater(c) : c)
    );
  };

  // Helper to update any conversation by ID
  const updateConversation = (conversationId: string, updater: (_conv: Conversation) => Conversation) => {
    setConversations(prev => 
      prev.map(c => c.id === conversationId ? updater(c) : c)
    );
  };

  // Generate smart title from first message
  const generateTitleFromMessage = (content: string): string => {
    const cleaned = content.trim();
    if (cleaned.length <= VALIDATION_LIMITS.TITLE_CHAR_LIMIT) return cleaned;
    
    // Extract first sentence or first 50 chars
    const firstSentence = cleaned.split('.')[0];
    if (firstSentence.length <= VALIDATION_LIMITS.TITLE_CHAR_LIMIT) return firstSentence;
    
    return cleaned.substring(0, VALIDATION_LIMITS.TITLE_TRUNCATE_POINT) + "...";
  };

  // Helper function to extract PRD from messages (same as server-side)
  const getPRDFromMessages = (messages: any[]): any => {
    // Look for the most recent PRD content in the conversation
    for (let i = messages.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(messages[i].content);
        if (parsed && typeof parsed.problemStatement === 'string') {
          return parsed;
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  // Update conversation title
  const updateConversationTitle = (conversationId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle || trimmedTitle.length === 0) {
      return false; // Invalid title
    }
    
    if (trimmedTitle.length > VALIDATION_LIMITS.MAX_TITLE_LENGTH) {
      return false; // Too long
    }

    updateConversation(conversationId, conv => ({
      ...conv,
      title: trimmedTitle
    }));
    
    return true;
  };

  // Start editing a conversation title
  const startEditingTitle = (conversationId: string, currentTitle: string) => {
    setEditingConversationId(conversationId);
    setTempTitle(currentTitle);
  };

  // Save title edit
  const saveTitle = () => {
    if (!editingConversationId) return;
    
    if (updateConversationTitle(editingConversationId, tempTitle)) {
      setEditingConversationId(null);
      setTempTitle("");
    }
  };

  // Cancel title edit
  const cancelTitleEdit = () => {
    setEditingConversationId(null);
    setTempTitle("");
  };

  // Delete conversation
  const deleteConversation = (conversationId: string) => {
    const conversationToDelete = conversations.find(c => c.id === conversationId);
    if (!conversationToDelete) return;

    // Remove the conversation from the list
    const updatedConversations = conversations.filter(c => c.id !== conversationId);
    setConversations(updatedConversations);

    // Handle active conversation switching
    if (conversationId === activeId) {
      // If we're deleting the active conversation, switch to another one
      if (updatedConversations.length > 0) {
        // Switch to the first remaining conversation
        setActiveId(updatedConversations[0].id);
      } else {
        // If no conversations left, create a new one
        const newId = uuidv4();
        const newConv: Conversation = {
          id: newId,
          title: "New PRD",
          messages: [],
          createdAt: new Date().toISOString(),
        };
        setConversations([newConv]);
        setActiveId(newId);
      }
    }

    // Clear delete confirmation state
    setDeletingConversationId(null);
  };

  // Confirm deletion
  const confirmDelete = (conversationId: string) => {
    setDeletingConversationId(conversationId);
  };

  // Cancel deletion
  const cancelDelete = () => {
    setDeletingConversationId(null);
  };

  // Helper function to extract provider from model ID

  // Fetch agent defaults from backend
  const pruneInvalidOverrides = useCallback((availableModels: string[]) => {
    if (!availableModels || availableModels.length === 0) {
      return;
    }

    const availableSet = new Set(availableModels);

    setSettings(prev => {
      const overrides = prev.subAgentSettings;
      if (!overrides || Object.keys(overrides).length === 0) {
        return prev;
      }

      let changed = false;
      const filtered: SubAgentSettingsMap = {};

      for (const [key, value] of Object.entries(overrides)) {
        if (value?.model && availableSet.has(value.model)) {
          filtered[key] = value;
        } else {
          changed = true;
        }
      }

      if (!changed) {
        return prev;
      }

      console.warn('Removing unavailable sub-agent overrides that are no longer in the model catalog');
      return {
        ...prev,
        subAgentSettings: filtered
      };
    });
  }, []);

  const fetchAgentDefaults = useCallback(async () => {
    try {
      console.log("Fetching agent defaults...");
      const response = await fetch("/api/agent-defaults");
      
      if (!response.ok) {
        throw new Error(`Failed to fetch agent defaults: ${response.status}`);
      }
      
      const payload = await response.json();
      console.log("Agent defaults received:", payload);
      setAgentMetadata(payload.metadata || null);
      return payload;
    } catch (error) {
      console.error("Failed to fetch agent defaults:", error);
      return null;
    }
  }, []);

  // Fetch available models from API
  const fetchModels = useCallback(async (apiKey?: string) => {
    try {
      const params = new URLSearchParams();
      if (apiKey) params.append('apiKey', apiKey);
      
      const response = await fetch(`/api/models?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.models && Array.isArray(data.models)) {
        setModels(data.models); // Update context
        pruneInvalidOverrides(data.models.map((m: any) => m.id));
        return data.models;
      } else {
        throw new Error('Invalid models data format');
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      setModels([]); // Update context
      return [];
    }
  }, [setModels, pruneInvalidOverrides]);

  // Update model context when settings model changes
  useEffect(() => {
    if (settings.model) {
      updateModelFromId(settings.model);
    }
  }, [settings.model, updateModelFromId]);

  // Update context summary whenever context changes
  useEffect(() => {
    const updateContextSummary = () => {
      try {
        // Get current active conversation messages
        const currentMessages = activeConversation?.messages || [];
        const contextPayload = buildEnhancedContextPayload(currentMessages);
        setContextSummary(getContextSummary(contextPayload));
      } catch (error) {
        console.error('Error updating context summary:', error);
        setContextSummary('No active context');
      }
    };
    
    updateContextSummary();
    
    // Update on storage events (when context is modified in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('prd-agent-categorized-context') || 
          e.key?.startsWith('prd-agent-selected-messages') ||
          e.key?.startsWith('prd-agent-context-settings')) {
        updateContextSummary();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also update when context panel opens/closes (might have changes)
    if (!contextOpen) {
      updateContextSummary();
    }
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [contextOpen, activeConversation]);

  useEffect(() => {
    let savedSettings: AgentSettingsState | null = null;
    let isMounted = true;

    const initializeStorage = () => {
      console.log("Initializing from localStorage...");

      try {
        const rawConversations = localStorage.getItem("prd-agent-conversations");
        const rawActiveId = localStorage.getItem("prd-agent-active-conversation");
        const rawSettings = localStorage.getItem("prd-agent-settings");

        if (rawSettings && rawSettings.trim() && rawSettings !== "undefined" && rawSettings !== "null") {
          try {
            const parsed = JSON.parse(rawSettings) as AgentSettingsState;
            parsed.subAgentSettings = parsed.subAgentSettings || {};
            if (!parsed.artifactTypes || parsed.artifactTypes.length === 0) {
              parsed.artifactTypes = ['prd'];
            }
            savedSettings = parsed;
            console.log("Loaded settings from localStorage:", parsed);
          } catch (parseErr) {
            console.warn("Failed to parse settings from localStorage:", parseErr);
          }
        }

        let conversationsFromStorage: Conversation[] = [];
        if (rawConversations && rawConversations.trim() && rawConversations !== "undefined" && rawConversations !== "null") {
          try {
            const parsed = JSON.parse(rawConversations) as Conversation[];
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(c => c.id && c.title && Array.isArray(c.messages))) {
              conversationsFromStorage = parsed;
            } else {
              console.warn("Invalid conversation data structure, reinitializing");
            }
          } catch (parseErr) {
            console.warn("Failed to parse conversations from localStorage:", parseErr);
          }
        }

        if (conversationsFromStorage.length === 0) {
          const id = uuidv4();
          conversationsFromStorage = [{
            id,
            title: "New PRD",
            messages: [],
            createdAt: new Date().toISOString(),
          }];
        }

        if (isMounted) {
          setConversations(conversationsFromStorage);

          let savedActiveId: string | null = null;
          if (rawActiveId && rawActiveId.trim() && rawActiveId !== "undefined" && rawActiveId !== "null") {
            try {
              savedActiveId = JSON.parse(rawActiveId) as string;
            } catch (parseErr) {
              console.warn("Failed to parse active conversation ID:", parseErr);
            }
          }

          const activeConv = savedActiveId ? conversationsFromStorage.find(c => c.id === savedActiveId) : conversationsFromStorage[0];
          setActiveId((activeConv || conversationsFromStorage[0]).id);
        }
      } catch (err) {
        console.error("Critical error during initialization:", err);
        const id = uuidv4();
        if (isMounted) {
          setConversations([{
            id,
            title: "New PRD",
            messages: [],
            createdAt: new Date().toISOString(),
          }]);
          setActiveId(id);
        }
      }
    };

    const initialize = async () => {
      initializeStorage();
      isInitializedRef.current = true;

      const defaultsPayload = await fetchAgentDefaults();
      const defaultSettings = defaultsPayload?.settings as (AgentSettingsState | undefined);
      const metadata = defaultsPayload?.metadata || null;

      const baseSettings = initialSettingsRef.current;

      const merged: AgentSettingsState = {
        model: baseSettings.model,
        temperature: baseSettings.temperature,
        maxTokens: baseSettings.maxTokens,
        apiKey: baseSettings.apiKey,
        streaming: baseSettings.streaming,
        subAgentSettings: baseSettings.subAgentSettings || {},
        artifactTypes: baseSettings.artifactTypes && baseSettings.artifactTypes.length > 0 ? baseSettings.artifactTypes : ['prd']
      };

      if (defaultSettings) {
        merged.model = defaultSettings.model ?? merged.model;
        merged.temperature = defaultSettings.temperature ?? merged.temperature;
        merged.maxTokens = defaultSettings.maxTokens ?? merged.maxTokens;
        merged.apiKey = defaultSettings.apiKey ?? merged.apiKey;
        merged.subAgentSettings = defaultSettings.subAgentSettings || merged.subAgentSettings;
        if (defaultSettings.artifactTypes && defaultSettings.artifactTypes.length > 0) {
          merged.artifactTypes = defaultSettings.artifactTypes;
        }
      }

      if (savedSettings) {
        merged.model = savedSettings.model ?? merged.model;
        merged.temperature = savedSettings.temperature ?? merged.temperature;
        merged.maxTokens = savedSettings.maxTokens ?? merged.maxTokens;
        merged.apiKey = savedSettings.apiKey ?? merged.apiKey;
        merged.streaming = savedSettings.streaming ?? merged.streaming;
        if (savedSettings.artifactTypes && savedSettings.artifactTypes.length > 0) {
          merged.artifactTypes = savedSettings.artifactTypes;
        }
      }

      if (metadata || savedSettings?.subAgentSettings || defaultSettings?.subAgentSettings) {
        merged.subAgentSettings = buildSubAgentSettings(
          metadata,
          defaultSettings?.subAgentSettings,
          savedSettings?.subAgentSettings,
          {
            model: merged.model,
            temperature: merged.temperature,
            maxTokens: merged.maxTokens,
            apiKey: merged.apiKey,
          }
        );
      }

      if (isMounted) {
        setSettings(prev => ({
          ...prev,
          ...merged,
        }));
      }

      const finalApiKey = savedSettings?.apiKey ?? defaultSettings?.apiKey ?? merged.apiKey;

      try {
        await fetchModels(finalApiKey);
      } catch (error) {
        console.error('Failed to fetch models during initialization:', error);
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [fetchAgentDefaults, fetchModels]);


  useEffect(() => {
    if (!isInitializedRef.current) {
      console.log("Skipping save - not initialized yet");
      return;
    }

    // Validate data before saving
    if (!conversations || conversations.length === 0) {
      console.warn("Skipping save - no conversations to save");
      return;
    }

    // Validate conversation structure
    const isValidData = conversations.every(c => 
      c && 
      typeof c.id === 'string' && 
      typeof c.title === 'string' && 
      Array.isArray(c.messages) &&
      typeof c.createdAt === 'string'
    );

    if (!isValidData) {
      console.error("Skipping save - invalid conversation data structure");
      return;
    }

    try {
      console.log("Saving conversations to localStorage:", conversations.length);
      localStorage.setItem("prd-agent-conversations", JSON.stringify(conversations));
      
      if (activeId) {
        localStorage.setItem("prd-agent-active-conversation", JSON.stringify(activeId));
        console.log("Saved active conversation ID:", activeId);
      }
    } catch (err) {
      console.error("Error saving conversations to localStorage:", err);
    }
  }, [conversations, activeId]);

  // Save settings to localStorage
  useEffect(() => {
    if (!isInitializedRef.current) {
      console.log("Skipping settings save - not initialized yet");
      return;
    }

    try {
      console.log("Saving settings to localStorage:", settings);
      localStorage.setItem("prd-agent-settings", JSON.stringify(settings));
    } catch (err) {
      console.error("Error saving settings to localStorage:", err);
    }
  }, [settings]);




  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, UI_DIMENSIONS.TEXTAREA_MAX_HEIGHT) + "px";
    }
  }, [input]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeMessages]);

  const handlePRDUpdate = (messageId: string, updatedPRD: NewPRD) => {
    updateActiveConversation(conv => ({
      ...conv,
      messages: conv.messages.map((msg: Message) =>
        msg.id === messageId ? { ...msg, content: JSON.stringify(updatedPRD, null, 2) } : msg
      )
    }));
  };

  const handleCopy = async (content: string, messageId: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(messageId);
    setTimeout(() => setCopied(null), TimingSettings.COPY_FEEDBACK_TIMEOUT);
  };

  function createConversation() {
    const id = uuidv4();
    const conv: Conversation = {
      id,
      title: "New PRD",
      messages: [],
      createdAt: new Date().toISOString(),
    };

    setConversations((prev) => [conv, ...prev]);
    setActiveId(id);
  }

  const handleCustomSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isChatLoading) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    const newMessages = [...activeMessages, userMessage];
    updateActiveConversation(conv => ({ ...conv, messages: newMessages }));
    setInput("");
    setIsChatLoading(true);
    
    // Reset progress events for new request
    setProgressEvents([]);

    try {
      // Sync conversation messages to selectable messages storage
      newMessages.forEach(message => {
        if (message.role === 'user' || message.role === 'assistant') {
          contextStorage.addSelectableMessage({
            id: message.id,
            content: message.content,
            role: message.role,
            timestamp: message.timestamp || new Date()
          });
        }
      });

      // Build enhanced context payload including categorized context, selected messages, and current PRD
      const existingPRD = getPRDFromMessages(newMessages);
      const contextPayload = buildEnhancedContextPayload(newMessages, existingPRD);

      if (activeArtifactType === 'persona' && !existingPRD) {
        throw new Error('Please generate a PRD before running the persona builder.');
      }

      if (isStreamingEnabled) {
        await handleStreamingSubmit(newMessages, contextPayload, userMessage, existingPRD);
      } else {
        await handleNonStreamingSubmit(newMessages, contextPayload, userMessage, existingPRD);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
        timestamp: new Date(),
      };
      const finalMessages = [...newMessages, errorMessage];
      updateActiveConversation(conv => {
        // Auto-generate title from first user message if still using default
        const shouldUpdateTitle = conv.title === "New PRD" && conv.messages.length === 0;
        return {
          ...conv, 
          messages: finalMessages,
          title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
        };
      });
    } finally {
      // Only reset loading state for non-streaming mode
      // Streaming mode handles this in its own finally block
      if (!isStreamingEnabled) {
        setIsChatLoading(false);
      }
    }
  };

  // Streaming submission handler with proper cleanup and error handling
  const handleStreamingSubmit = async (newMessages: Message[], contextPayload: any, userMessage: Message, existingPRD: any) => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let hasFinalArtifact = false;
    let runId: string | null = null;
    let streamedUsageSummary: any = null;
    let streamedMetadata: any = null;
    let streamedModel: string | null = settings.model ?? null;

    try {
      const run = await startRun({
        messages: newMessages,
        settings,
        contextPayload,
        artifactType: activeArtifactType,
        sourceArtifact: existingPRD ?? undefined
      });

      if (!run.runId) {
        throw new Error("Run was created without an id");
      }

      runId = run.runId;

      const response = await streamRun(run.runId);

      // Create EventSource-like interface from the response stream
      reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream available");
      }

      const decoder = new TextDecoder();
      let buffer = '';
      const assistantMessageId = uuidv4();

      const refreshTimeout = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          if (reader) {
            reader.cancel('Stream timeout');
          }
          setProgressEvents(prev => [
            ...prev,
            {
              type: 'final',
              timestamp: new Date().toISOString(),
              error: `Stream timeout after ${STREAM_TIMEOUT_MS / 1000 / 60} minutes`
            }
          ]);
        }, STREAM_TIMEOUT_MS);
      };

      refreshTimeout();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        refreshTimeout();
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          if (line.startsWith('event:')) {
            // const eventType = line.substring(6).trim();
            continue;
          }
          
          if (line.startsWith('data:')) {
            const dataStr = line.substring(5).trim();
            if (dataStr === '') continue;
            
            try {
              const eventData = JSON.parse(dataStr);
              if (eventData.metadata) {
                streamedMetadata = eventData.metadata;
                if (eventData.metadata?.usage) {
                  streamedUsageSummary = eventData.metadata.usage;
                }
              }

              if (eventData.artifact?.metadata && typeof eventData.artifact.metadata === 'object') {
                streamedMetadata = streamedMetadata ?? (eventData.artifact.metadata as Record<string, unknown>);
                const artifactUsage = (eventData.artifact.metadata as Record<string, unknown>).usage;
                if (artifactUsage) {
                  streamedUsageSummary = artifactUsage as any;
                }
              }

              if (eventData.usage) {
                streamedUsageSummary = eventData.usage;
              }

              if (typeof eventData.model === 'string') {
                streamedModel = eventData.model;
              }
              
              // Handle different event types
              if (eventData.type) {
                // Progress event
                setProgressEvents(prev => [...prev, eventData]);
              } else if (eventData.error) {
                throw new Error(eventData.error);
              } else if (eventData.artifact) {
                const artifactPayload = eventData.artifact as Record<string, unknown> | undefined;
                const artifactData =
                  artifactPayload && typeof artifactPayload === 'object'
                    ? ((artifactPayload as Record<string, unknown>).data as unknown) ?? artifactPayload
                    : eventData.artifact;

                let messageContent: string;
                if (typeof artifactData === 'string') {
                  messageContent = artifactData;
                } else {
                  try {
                    messageContent = JSON.stringify(artifactData, null, 2);
                  } catch {
                    messageContent = String(artifactData);
                  }
                }

                const artifactMetadata =
                  artifactPayload && typeof artifactPayload === 'object'
                    ? ((artifactPayload as Record<string, unknown>).metadata as Record<string, unknown> | undefined)
                    : undefined;

                const assistantMetadata = buildAssistantMetadata(
                  streamedUsageSummary ?? eventData.usage,
                  streamedModel,
                  streamedMetadata || eventData.metadata || artifactMetadata
                );

                hasFinalArtifact = true;

                const assistantMessage: Message = {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: messageContent,
                  timestamp: new Date(),
                  ...(assistantMetadata ? { metadata: assistantMetadata } : {})
                };

                const finalMessages = [...newMessages, assistantMessage];
                updateActiveConversation(conv => {
                  const shouldUpdateTitle = conv.title === 'New PRD' && conv.messages.length === 0;
                  return {
                    ...conv,
                    messages: finalMessages,
                    title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
                  };
                });
                streamedUsageSummary = null;
                streamedMetadata = null;
              } else if (eventData.content) {
                const contentPayload = eventData.content;
                const messageContent =
                  typeof contentPayload === 'string'
                    ? contentPayload
                    : JSON.stringify(contentPayload, null, 2);

                const assistantMetadata = buildAssistantMetadata(
                  streamedUsageSummary ?? eventData.usage,
                  streamedModel,
                  streamedMetadata || eventData.metadata
                );

                hasFinalArtifact = true;

                const assistantMessage: Message = {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: messageContent,
                  timestamp: new Date(),
                  ...(assistantMetadata ? { metadata: assistantMetadata } : {})
                };

                const finalMessages = [...newMessages, assistantMessage];
                updateActiveConversation(conv => {
                  const shouldUpdateTitle = conv.title === 'New PRD' && conv.messages.length === 0;
                  return {
                    ...conv,
                    messages: finalMessages,
                    title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
                  };
                });
                streamedUsageSummary = null;
                streamedMetadata = null;
              } else if (eventData.needsClarification) {
                // Handle clarification request
                const questionsText = eventData.questions?.map((q: string, index: number) => 
                  `**${index + 1}. ${q}**`
                ).join('\n\n');
                
                const content = `I need more information to create a comprehensive PRD. Please help me understand:\n\n${questionsText}\n\nPlease provide as much detail as possible for each area.`;
                const assistantMetadata = buildAssistantMetadata(
                  streamedUsageSummary ?? eventData.usage,
                  streamedModel,
                  streamedMetadata || eventData.metadata || (eventData.confidence ? { overall_confidence: eventData.confidence } : undefined)
                );
                
                const assistantMessage: Message = {
                  id: assistantMessageId,
                  role: "assistant",
                  content: content,
                  timestamp: new Date(),
                  ...(assistantMetadata ? { metadata: assistantMetadata } : {})
                };

                const finalMessages = [...newMessages, assistantMessage];
                updateActiveConversation(conv => {
                  const shouldUpdateTitle = conv.title === "New PRD" && conv.messages.length === 0;
                  return {
                    ...conv, 
                    messages: finalMessages,
                    title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
                  };
                });
                streamedUsageSummary = null;
                streamedMetadata = null;
              }
            } catch (parseError) {
              console.warn('Failed to parse SSE data:', dataStr, parseError);
            }
          }
        }
      }
    } finally {
      // Reset loading state
      setIsChatLoading(false);
      setProgressEvents([]); // Clear progress events
      
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Clean up reader
      if (reader) {
        try {
          reader.releaseLock();
        } catch (error) {
          console.warn('Error releasing reader lock:', error);
        }
      }

      if (!hasFinalArtifact && runId) {
        try {
          const runSummary = await getRun(runId);
          const artifactPayload = (runSummary?.result as Record<string, unknown> | undefined) ??
            (runSummary?.summary?.artifact as Record<string, unknown> | undefined) ?? null;

          if (artifactPayload) {
            const artifactData =
              typeof artifactPayload === 'object'
                ? ((artifactPayload as Record<string, unknown>).data as unknown) ?? artifactPayload
                : artifactPayload;

            let messageContent: string;
            if (typeof artifactData === 'string') {
              messageContent = artifactData;
            } else {
              try {
                messageContent = JSON.stringify(artifactData, null, 2);
              } catch {
                messageContent = String(artifactData);
              }
            }

            const assistantMetadata = buildAssistantMetadata(
              runSummary?.usage ?? null,
              streamedModel,
              runSummary?.metadata ?? null
            );

            const assistantMessage: Message = {
              id: uuidv4(),
              role: 'assistant',
              content: messageContent,
              timestamp: new Date(),
              ...(assistantMetadata ? { metadata: assistantMetadata } : {})
            };

            const finalMessages = [...newMessages, assistantMessage];
            updateActiveConversation(conv => {
              const shouldUpdateTitle = conv.title === 'New PRD' && conv.messages.length === 0;
              return {
                ...conv,
                messages: finalMessages,
                title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
              };
            });
          }
        } catch (fallbackError) {
          console.warn('Failed to fetch run summary after stream completion', fallbackError);
        }
      }
    }
  };

  // Non-streaming submission handler (original logic)
  const handleNonStreamingSubmit = async (newMessages: Message[], contextPayload: any, userMessage: Message, existingPRD: any) => {
    const runResult = await startRun({
      messages: newMessages,
      settings,
      contextPayload,
      artifactType: activeArtifactType,
      sourceArtifact: existingPRD ?? undefined
    });

    if (activeArtifactType === 'persona') {
      const personaPayload = (runResult.result as Record<string, unknown> | undefined) ?? {}
      const personaArtifact = (runResult.artifact as Record<string, unknown> | undefined) ??
        ((personaPayload?.artifact as Record<string, unknown> | undefined) ?? null)

      if (!personaArtifact) {
        throw new Error('Persona subagent did not return an artifact payload')
      }

      const messageContent = JSON.stringify(personaArtifact, null, 2)
      const assistantMetadata = buildAssistantMetadata(null, settings.model ?? null, runResult.metadata ?? undefined)

      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: messageContent,
        timestamp: new Date(),
        ...(assistantMetadata ? { metadata: assistantMetadata } : {})
      }

      const finalMessages = [...newMessages, assistantMessage]
      updateActiveConversation(conv => {
        const shouldUpdateTitle = conv.title === "New PRD" && conv.messages.length === 0
        return {
          ...conv,
          messages: finalMessages,
          title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
        }
      })

      return
    }

    const data: any = runResult.result ?? {}
    if (data.error) throw new Error(data.error)

    // Handle both structured data and string content
    let messageContent: string;
    if (data.isStructured && typeof data.content === 'object') {
      messageContent = JSON.stringify(data.content, null, 2);
    } else if (data.content && typeof data.content === 'string') {
      messageContent = data.content;
    } else {
      messageContent = data.content || "No response";
    }

    const responseUsage = data.usage ?? data.metadata?.usage ?? null;
    const responseMetadata = data.metadata ?? (data.confidence ? { overall_confidence: data.confidence } : undefined);
    const responseModel = data.model ?? settings.model ?? null;
    const assistantMetadata = buildAssistantMetadata(responseUsage, responseModel, responseMetadata);

    const assistantMessage: Message = {
      id: uuidv4(),
      role: "assistant",
      content: messageContent,
      timestamp: new Date(),
      ...(assistantMetadata ? { metadata: assistantMetadata } : {})
    };

    const finalMessages = [...newMessages, assistantMessage];
    updateActiveConversation(conv => {
      const shouldUpdateTitle = conv.title === "New PRD" && conv.messages.length === 0;
      return {
        ...conv, 
        messages: finalMessages,
        title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
      };
    });
  };

  return (
    <TooltipProvider>
      <div className="h-screen w-screen flex flex-col bg-background text-foreground">
        {/* Header */}
        <header className="h-14 flex flex-row items-center gap-4 px-4 border-b">
        <Button variant="ghost" size="sm" onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}>
          <Menu className="h-4 w-4" />
        </Button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold">PRD Generator Agent</h1>
        </div>

        <div className="flex items-center gap-2">
          {contextSummary !== 'No active context' && (
            <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              {contextSummary}
            </div>
          )}
          {formattedConversationCost && conversationCost && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded cursor-default">
                  Spend: {formattedConversationCost}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  {conversationCost.entries.map(entry => (
                    <div key={entry.id}>
                      {entry.label}: {formatCostValue(entry.cost, entry.currency)}
                      {entry.source === 'estimated' ? ' (est.)' : ''}
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
          <ContextUsageIndicator
            currentMessages={activeMessages}
            currentPRD={getPRDFromMessages(activeMessages)}
            className="hidden sm:flex"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setContextOpen(!contextOpen)}
                className={contextSummary !== 'No active context' ? 'text-blue-600' : ''}
              >
                <Database className="h-4 w-4 mr-2" />
                Context
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{contextSummary === 'No active context' ? 'Open context management to add and select context items' : `Active context: ${contextSummary}`}</p>
            </TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(!settingsOpen)}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left collapsible sidebar */}
        <aside
          className={`${
            leftSidebarOpen ? UI_DIMENSIONS.SIDEBAR_EXPANDED_WIDTH : UI_DIMENSIONS.SIDEBAR_COLLAPSED_WIDTH
          } transition-all duration-200 border-l bg-sidebar overflow-hidden flex flex-col`}
        >
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-muted px-2 py-1 text-sm font-medium">
                PRD
              </div>
              {leftSidebarOpen && (
                <div className="text-sm font-semibold">Conversations</div>
              )}
            </div>
            {leftSidebarOpen && (
              <Button size="sm" variant="outline" onClick={createConversation}>
                <Plus className="h-4 w-4 mr-2" /> New
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-auto px-2 py-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-accent ${
                  conv.id === activeId ? "ring-2 ring-sidebar-ring" : ""
                }`}
              >
                <MessageCircle className="h-5 w-5 flex-shrink-0" />
                {leftSidebarOpen && (
                  <div className="flex-1 min-w-0">
                    {editingConversationId === conv.id ? (
                      // Edit mode
                      <div className="flex items-center gap-1 mb-1">
                        <Input
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          className="h-6 text-sm font-medium"
                          placeholder="Conversation title"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveTitle();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelTitleEdit();
                            }
                          }}
                          onBlur={() => {
                            // Save on blur unless user clicked cancel
                            setTimeout(() => saveTitle(), TimingSettings.SAVE_TITLE_BLUR_DELAY);
                          }}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveTitle();
                          }}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelTitleEdit();
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      // Display mode
                      <div className="flex items-center group">
                        <button
                          className="flex-1 text-left"
                          onClick={() => setActiveId(conv.id)}
                          title={conv.title}
                        >
                          <div className="font-medium text-sm truncate">{conv.title}</div>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditingTitle(conv.id, conv.title);
                            }}
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                          {deletingConversationId === conv.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteConversation(conv.id);
                                }}
                                title="Confirm delete"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  cancelDelete();
                                }}
                                title="Cancel delete"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5 text-muted-foreground hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDelete(conv.id);
                              }}
                              title="Delete conversation"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {new Date(conv.createdAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Right chat area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Messages scroll area */}
          <div ref={scrollRef} className="flex-1 overflow-auto p-6">
            {activeMessages.length === 0 ? (
              <div className="mx-auto max-w-2xl text-center py-24">
                <h2 className="text-2xl font-bold mb-2">Welcome to PRD Agent</h2>
                <p className="text-muted-foreground mb-6">
                  Ask the agent to generate or edit a PRD. Try: &quot;Create a PRD for a mobile payment app&quot;
                </p>
                <div className="grid gap-2">
                  <button
                    className="rounded-md border p-3 text-left hover:bg-accent"
                    onClick={() => {
                      const suggestion = "Create a PRD for a mobile payment app";
                      setInput(suggestion);
                    }}
                  >
                    Create a PRD for a mobile payment app
                  </button>
                  <button
                    className="rounded-md border p-3 text-left hover:bg-accent"
                    onClick={() => {
                      const suggestion = "Create a PRD for an AI customer support chatbot";
                      setInput(suggestion);
                    }}
                  >
                    Create a PRD for an AI customer support chatbot
                  </button>
                </div>
              </div>
            ) : (
              <ChatMessages
                messages={activeMessages}
                isProcessing={isChatLoading}
                copied={copied}
                onCopy={handleCopy}
                onPRDUpdate={handlePRDUpdate}
                progressEvents={progressEvents}
                isStreaming={isChatLoading && isStreamingEnabled}
              />
            )}
          </div>

          {/* Input area */}
          <div className="border-t p-4 bg-card">
            <div className="mx-auto max-w-4xl">
              <form onSubmit={handleCustomSubmit}>
                <div className="flex gap-2 items-center">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleCustomSubmit(e as any);
                      }
                    }}
                    placeholder="Type your requirements or prompt..."
                    className="min-h-[48px] resize-none"
                    rows={1}
                  />

                  <Button type="submit" disabled={!input.trim() || isChatLoading} size="icon">
                    {isChatLoading ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </main>


        {/* Context Panel */}
        <ContextPanel
          isOpen={contextOpen}
          onClose={() => setContextOpen(false)}
        />

        {/* Settings Panel */}
        <SettingsPanel
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          metadata={agentMetadata}
          onSettingsChange={setSettings}
        />
      </div>

      </div>
    </TooltipProvider>
  );
}

export default function PRDAgentPage() {
  return (
    <AppStateProvider>
      <PRDAgentPageContent />
    </AppStateProvider>
  );
}
