"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Conversation, Message } from "@/types";
import { PRD } from "@/lib/prd-schema";
import { ContextPanel } from "@/components/context";
import { contextStorage } from "@/lib/context-storage";
import { buildEnhancedContextPayload, getContextSummary } from "@/lib/context-utils";
// AgentSettings interface
interface AgentSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
}

// Enhanced model interface from OpenRouter
interface EnhancedModel {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  pricing: {
    prompt: number;
    completion: number;
    promptFormatted: string;
    completionFormatted: string;
  };
  isTopProvider: boolean;
  maxCompletionTokens?: number;
  isModerated: boolean;
  provider: string;
  toolSupport?: boolean;
  capabilities?: string[];
}


export default function PRDAgentPage() {
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  
  // Settings state  
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AgentSettings>({
    model: "anthropic/claude-3-7-sonnet", // Will be updated with agent defaults
    temperature: 0.7, // Will be updated with agent defaults
    maxTokens: 8000, // Will be updated with agent defaults
    apiKey: undefined
  });
  
  // Context panel state
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSummary, setContextSummary] = useState<string>('');

  // Note: Context summary useEffect will be defined after computed values
  
  // Models state
  const [models, setModels] = useState<EnhancedModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  
  // Provider selection state
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  
  // Title editing state
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");

  // Delete confirmation state
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);

  // track initialization so we don't run sync effects before we've loaded from localStorage
  const isInitializedRef = useRef(false);
  
  // Use ref to track fetch in progress to prevent duplicate requests
  const fetchingModelsRef = useRef(false);

  // Computed helpers for working with active conversation
  const activeConversation = conversations.find(c => c.id === activeId);
  const activeMessages = React.useMemo(() => activeConversation?.messages || [], [activeConversation]);

  // Computed helpers for provider/model selection
  const availableProviders = React.useMemo(() => {
    const providerMap = new Map<string, { name: string; count: number; isTopProvider: boolean }>();
    
    models.forEach(model => {
      const provider = model.provider;
      const existing = providerMap.get(provider);
      providerMap.set(provider, {
        name: provider,
        count: (existing?.count || 0) + 1,
        isTopProvider: existing?.isTopProvider || model.isTopProvider
      });
    });
    
    return Array.from(providerMap.values()).sort((a, b) => {
      // Sort by top providers first, then alphabetically
      if (a.isTopProvider && !b.isTopProvider) return -1;
      if (!a.isTopProvider && b.isTopProvider) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [models]);

  const modelsForProvider = React.useMemo(() => {
    if (!selectedProvider) return [];
    return models.filter(model => model.provider === selectedProvider);
  }, [models, selectedProvider]);

  // Helper to update the active conversation
  const updateActiveConversation = (updater: (conv: Conversation) => Conversation) => {
    if (!activeId) return;
    setConversations(prev => 
      prev.map(c => c.id === activeId ? updater(c) : c)
    );
  };

  // Helper to update any conversation by ID
  const updateConversation = (conversationId: string, updater: (conv: Conversation) => Conversation) => {
    setConversations(prev => 
      prev.map(c => c.id === conversationId ? updater(c) : c)
    );
  };

  // Generate smart title from first message
  const generateTitleFromMessage = (content: string): string => {
    const cleaned = content.trim();
    if (cleaned.length <= 50) return cleaned;
    
    // Extract first sentence or first 50 chars
    const firstSentence = cleaned.split('.')[0];
    if (firstSentence.length <= 50) return firstSentence;
    
    return cleaned.substring(0, 47) + "...";
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
    
    if (trimmedTitle.length > 100) {
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
  const extractProviderFromModel = (modelId: string): string => {
    // Model IDs are typically in format "provider/model-name"
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0] : modelId;
  };

  // Fetch agent defaults from backend
  const fetchAgentDefaults = useCallback(async () => {
    try {
      console.log("Fetching agent defaults...");
      const response = await fetch("/api/agent-defaults");
      
      if (!response.ok) {
        throw new Error(`Failed to fetch agent defaults: ${response.status}`);
      }
      
      const defaults = await response.json();
      console.log("Agent defaults received:", defaults);
      
      // Update settings with agent defaults (but preserve any existing apiKey)
      setSettings(prev => ({
        ...prev,
        model: defaults.model || prev.model,
        temperature: defaults.temperature || prev.temperature,
        maxTokens: defaults.maxTokens || prev.maxTokens,
        // Don't override apiKey from localStorage
      }));
      
      // Immediately derive and set provider from default model
      if (defaults.model) {
        const provider = extractProviderFromModel(defaults.model);
        console.log("Setting provider from agent default model:", provider);
        setSelectedProvider(provider);
      }
      
      return defaults;
    } catch (error) {
      console.error("Failed to fetch agent defaults:", error);
      return null;
    }
  }, []);

  // Fetch models from OpenRouter
  const fetchModels = useCallback(async (apiKey?: string) => {
    console.log("fetchModels called, fetchingModelsRef.current:", fetchingModelsRef.current);
    if (fetchingModelsRef.current) return; // Prevent duplicate requests
    
    console.log("Starting to fetch models...");
    fetchingModelsRef.current = true;
    setModelsLoading(true);
    setModelsError(null);
    
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      
      // Include API key if available
      if (apiKey) {
        headers["x-api-key"] = apiKey;
      } else {
        console.log("No API key provided, using environment variables");
      }      
      const response = await fetch("/api/models", { headers });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error response:", errorText);
        throw new Error(`Failed to fetch models: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }
      
      setModels(data.models || []);
      console.log(`Successfully loaded ${data.models?.length || 0} models from OpenRouter`);
      
    } catch (error) {
      console.error("Error fetching models:", error);
      setModelsError(error instanceof Error ? error.message : "Failed to fetch models");
    } finally {
      setModelsLoading(false);
      fetchingModelsRef.current = false;
    }
  }, []);

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
    console.log("Initializing from localStorage...");
    
    // Declare variables with broader scope for use in finally block
    let savedSettings: AgentSettings | null = null;
    
    try {
      const raw = localStorage.getItem("prd-agent-conversations");
      const activeRaw = localStorage.getItem("prd-agent-active-conversation");
      const settingsRaw = localStorage.getItem("prd-agent-settings");
      
      console.log("Raw localStorage data:", { raw, activeRaw, settingsRaw });

      // Load settings (will be merged with agent defaults later)
      savedSettings = settingsRaw && settingsRaw.trim() && settingsRaw !== "undefined" && settingsRaw !== "null" 
        ? (() => {
            try {
              const parsed = JSON.parse(settingsRaw) as AgentSettings;
              console.log("Loaded settings from localStorage:", parsed);
              return parsed;
            } catch (parseErr) {
              console.warn("Failed to parse settings from localStorage:", parseErr);
              return null;
            }
          })()
        : null;

      // Load selected provider
      const providerRaw = localStorage.getItem("prd-agent-selected-provider");
      if (providerRaw && providerRaw.trim() && providerRaw !== "undefined" && providerRaw !== "null") {
        try {
          const savedProvider = JSON.parse(providerRaw) as string;
          setSelectedProvider(savedProvider);
          console.log("Loaded provider from localStorage:", savedProvider);
        } catch (parseErr) {
          console.warn("Failed to parse provider from localStorage:", parseErr);
        }
      }


      let parsed: Conversation[] = [];
      let needsInitialization = true;

      // Only try to parse if we have actual data
      if (raw && raw.trim() && raw !== "undefined" && raw !== "null") {
        try {
          parsed = JSON.parse(raw) as Conversation[];
          // Validate the parsed data
          if (Array.isArray(parsed) && parsed.length > 0 && parsed.every(c => c.id && c.title && Array.isArray(c.messages))) {
            needsInitialization = false;
            console.log("Successfully loaded conversations from localStorage:", parsed.length);
          } else {
            console.warn("Invalid conversation data structure, reinitializing");
          }
        } catch (parseErr) {
          console.warn("Failed to parse conversations from localStorage:", parseErr);
          // Don't throw - just reinitialize
        }
      } else {
        console.log("No valid localStorage data found, creating initial conversation");
      }

      // Only create initial conversation if we truly need it
      if (needsInitialization) {
        const id = uuidv4();
        const initial: Conversation = {
          id,
          title: "New PRD",
          messages: [],
          createdAt: new Date().toISOString(),
        };
        parsed = [initial];
        console.log("Created new initial conversation:", id);
      }

      setConversations(parsed);

      // Handle active conversation ID
      let savedActiveId: string | null = null;
      if (activeRaw && activeRaw.trim() && activeRaw !== "undefined" && activeRaw !== "null") {
        try {
          savedActiveId = JSON.parse(activeRaw) as string;
        } catch (parseErr) {
          console.warn("Failed to parse active conversation ID:", parseErr);
        }
      }

      const activeConv = savedActiveId ? parsed.find((c) => c.id === savedActiveId) : parsed[0];
      const useActive = activeConv || parsed[0];
      setActiveId(useActive.id);
      console.log("Set active conversation:", useActive.id);

    } catch (err) {
      console.error("Critical error during initialization:", err);
      // Only create fallback if we hit a critical error
      const id = uuidv4();
      const initial: Conversation = {
        id,
        title: "New PRD",
        messages: [],
        createdAt: new Date().toISOString(),
      };
      setConversations([initial]);
      setActiveId(id);
    } finally {
      // Allow other effects to run safely after initialization finishes
      isInitializedRef.current = true;
      console.log("Initialization complete");
      
      // Fetch agent defaults and then models after initialization
      setTimeout(async () => {
        const agentDefaults = await fetchAgentDefaults();
        
        let finalApiKey: string | undefined;
        
        // Merge agent defaults with localStorage settings (localStorage takes precedence for user customizations)
        // Note: fetchAgentDefaults already updated settings and set provider, so we need to be careful not to override
        if (agentDefaults && savedSettings) {
          // Only update settings if localStorage has different values than what fetchAgentDefaults set
          const currentModel = savedSettings.model || agentDefaults.model;
          finalApiKey = savedSettings.apiKey;
          setSettings(prev => ({
            model: currentModel,
            temperature: savedSettings.temperature !== undefined ? savedSettings.temperature : (agentDefaults.temperature || prev.temperature),
            maxTokens: savedSettings.maxTokens || agentDefaults.maxTokens || prev.maxTokens,
            apiKey: savedSettings.apiKey || prev.apiKey // Always prefer localStorage apiKey
          }));
          
          // Re-derive provider if the final model is different from what fetchAgentDefaults set
          if (currentModel && currentModel !== agentDefaults.model) {
            const provider = extractProviderFromModel(currentModel);
            console.log("Re-setting provider based on localStorage model:", provider);
            setSelectedProvider(provider);
          }
        } else if (savedSettings) {
          // Only localStorage available
          finalApiKey = savedSettings.apiKey;
          setSettings(savedSettings);
          // Derive provider from localStorage model
          if (savedSettings.model) {
            const provider = extractProviderFromModel(savedSettings.model);
            console.log("Setting provider from localStorage model:", provider);
            setSelectedProvider(provider);
          }
        }
        // If only agentDefaults available, settings and provider are already updated by fetchAgentDefaults
        
        // Fetch models with the final API key
        fetchModels(finalApiKey);
      }, 100);
    }
  }, []);


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

  // Save selected provider to localStorage
  useEffect(() => {
    if (!isInitializedRef.current) {
      console.log("Skipping provider save - not initialized yet");
      return;
    }

    if (selectedProvider) {
      try {
        console.log("Saving provider to localStorage:", selectedProvider);
        localStorage.setItem("prd-agent-selected-provider", JSON.stringify(selectedProvider));
      } catch (err) {
        console.error("Error saving provider to localStorage:", err);
      }
    }
  }, [selectedProvider]);

  // Fetch models when API key changes (after initialization)
  useEffect(() => {
    if (!isInitializedRef.current) return;
    
    fetchModels(settings.apiKey);
  }, [settings.apiKey]);

  // Fallback provider selection (only when no provider is set and models are available)
  useEffect(() => {
    if (!isInitializedRef.current) return;
    if (models.length === 0) return;
    if (selectedProvider) return; // Provider already set
    
    // If current model exists in fetched models, derive provider from it
    const currentModel = models.find(model => model.id === settings.model);
    if (currentModel) {
      console.log("Fallback: Setting provider based on current model:", currentModel.provider);
      setSelectedProvider(currentModel.provider);
    } else if (availableProviders.length > 0) {
      // If current model doesn't exist, select first available provider and model
      const firstProvider = availableProviders[0];
      const firstModel = models.find(model => model.provider === firstProvider.name);
      if (firstModel) {
        console.log("Fallback: Model not found, defaulting to first available:", firstProvider.name, firstModel.id);
        setSelectedProvider(firstProvider.name);
        setSettings(prev => ({ ...prev, model: firstModel.id }));
      }
    }
  }, [models, settings.model, selectedProvider, availableProviders]);


  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [activeMessages]);

  const handlePRDUpdate = (messageId: string, updatedPRD: PRD) => {
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
    setTimeout(() => setCopied(null), 2000);
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

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: newMessages, 
          settings: settings,
          contextPayload: contextPayload
        }),
      });

      if (!response.ok) throw new Error("Chat request failed");

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: data.content || "No response",
        timestamp: new Date(),
      };

      const finalMessages = [...newMessages, assistantMessage];
      updateActiveConversation(conv => {
        // Auto-generate title from first user message if still using default
        const shouldUpdateTitle = conv.title === "New PRD" && conv.messages.length === 0;
        return {
          ...conv, 
          messages: finalMessages,
          title: shouldUpdateTitle ? generateTitleFromMessage(userMessage.content) : conv.title
        };
      });
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
      setIsChatLoading(false);
    }
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
            leftSidebarOpen ? "w-80" : "w-16"
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
                            setTimeout(() => saveTitle(), 100);
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
              />
            )}
          </div>

          {/* Input area */}
          <div className="border-t p-4 bg-card">
            <div className="mx-auto max-w-3xl">
              <form onSubmit={handleCustomSubmit}>
                <div className="flex gap-2">
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

        {/* Right Settings Sidebar */}
        <aside
          className={`${
            settingsOpen ? "w-80" : "w-0"
          } transition-all duration-200 border-l bg-sidebar overflow-hidden flex flex-col`}
        >
          {settingsOpen && (
            <>
              <div className="flex items-center justify-between p-3 border-b">
                <div className="text-sm font-semibold">Settings</div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSettingsOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex-1 overflow-auto p-4">
                <div className="space-y-6">
                  {/* Model Configuration */}
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                      Model Configuration
                    </div>
                    
                    {/* Provider Selection */}
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium">Provider</label>
                          <div className="flex items-center gap-2">
                            {modelsLoading && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                Loading...
                              </div>
                            )}
                            {modelsError && (
                              <button
                                onClick={() => fetchModels(settings.apiKey)}
                                className="text-xs text-red-500 hover:text-red-700 underline"
                              >
                                Retry
                              </button>
                            )}
                            {!modelsLoading && (
                              <button
                                onClick={() => fetchModels(settings.apiKey)}
                                className="text-xs text-blue-500 hover:text-blue-700 underline"
                                title="Refresh models"
                              >
                                Refresh
                              </button>
                            )}
                          </div>
                        </div>
                        <Select
                          value={selectedProvider}
                          onValueChange={(value: string) => {
                            setSelectedProvider(value);
                            // Reset model selection when provider changes
                            const firstModel = models.find(model => model.provider === value);
                            if (firstModel) {
                              setSettings(prev => ({ ...prev, model: firstModel.id }));
                            }
                          }}
                          disabled={modelsLoading}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={modelsLoading ? "Loading providers..." : "Select a provider"} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProviders.length === 0 && !modelsLoading ? (
                              <div className="p-2 text-sm text-muted-foreground text-center">
                                {modelsError 
                                  ? `Error: ${modelsError}` 
                                  : "No providers available. Click Refresh or add API key."
                                }
                              </div>
                            ) : (
                              availableProviders.map((provider) => (
                                <SelectItem key={provider.name} value={provider.name}>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium capitalize">{provider.name}</span>
                                    {provider.isTopProvider && (
                                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex-shrink-0">
                                        ⭐ Top
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                      ({provider.count} model{provider.count !== 1 ? 's' : ''})
                                    </span>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Model Selection */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Model</label>
                        <Select
                          value={settings.model}
                          onValueChange={(value: string) => setSettings(prev => ({ ...prev, model: value }))}
                          disabled={modelsLoading || !selectedProvider}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={
                              !selectedProvider ? "Select a provider first" : 
                              modelsLoading ? "Loading models..." : 
                              "Select a model"
                            } />
                          </SelectTrigger>
                          <SelectContent>
                            {modelsForProvider.length === 0 && !modelsLoading && selectedProvider ? (
                              <div className="p-2 text-sm text-muted-foreground text-center">
                                No models available for {selectedProvider}
                              </div>
                            ) : (
                              modelsForProvider.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  <div className="flex items-start justify-between w-full min-w-0">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium break-words">{model.name}</span>
                                        {model.isTopProvider && (
                                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex-shrink-0">
                                            ⭐ Top
                                          </span>
                                        )}
                                        {model.isModerated && (
                                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex-shrink-0">
                                            🛡️ Safe
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                                        <div className="flex items-center gap-3">
                                          <span>{(model.contextLength / 1000).toFixed(0)}K context</span>
                                          <span>{model.pricing.promptFormatted}/{model.pricing.completionFormatted} per 1M</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {modelsError && (
                          <p className="text-xs text-red-500 mt-1">
                            {modelsError}. Using fallback models.
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedProvider ? 
                            `${modelsForProvider.length} model${modelsForProvider.length !== 1 ? 's' : ''} available` :
                            `${availableProviders.length} provider${availableProviders.length !== 1 ? 's' : ''} available`
                          }
                          {modelsLoading && ' (loading...)'}
                        </p>
                      </div>
                      
                      {/* Temperature */}
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Temperature: {settings.temperature}
                        </label>
                        <Slider
                          value={[settings.temperature]}
                          onValueChange={([value]) => setSettings(prev => ({ ...prev, temperature: value }))}
                          max={2}
                          min={0}
                          step={0.1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>Precise</span>
                          <span>Balanced</span>
                          <span>Creative</span>
                        </div>
                      </div>
                      
                      {/* Max Tokens */}
                      <div>
                        <label className="block text-sm font-medium mb-2">Max Tokens</label>
                        <Input
                          type="number"
                          value={settings.maxTokens}
                          onChange={(e) => setSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                          className="w-full"
                        />
                      </div>
                      
                      {/* API Key */}
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          OpenRouter API Key (Optional)
                        </label>
                        <Input
                          type="password"
                          value={settings.apiKey || ''}
                          onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                          placeholder="sk-or-..."
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Leave empty to use environment variable
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Context Settings */}
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                      Context Configuration
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Context Token Limit: {contextStorage.getContextSettings().tokenLimitPercentage}%
                        </label>
                        <Slider
                          value={[contextStorage.getContextSettings().tokenLimitPercentage]}
                          onValueChange={([value]) => {
                            contextStorage.updateContextSettings({ tokenLimitPercentage: value });
                          }}
                          max={50}
                          min={10}
                          step={5}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground mt-1">
                          <span>10% (Conservative)</span>
                          <span>30% (Balanced)</span>
                          <span>50% (Maximum)</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Percentage of model context window to allocate for context items.
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="autoIncludePRD"
                          checked={contextStorage.getContextSettings().autoIncludeCurrentPRD}
                          onChange={(e) => contextStorage.updateContextSettings({ 
                            autoIncludeCurrentPRD: e.target.checked 
                          })}
                          className="rounded"
                        />
                        <label htmlFor="autoIncludePRD" className="text-sm font-medium">
                          Auto-include current PRD in context
                        </label>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </>
          )}
        </aside>

        {/* Context Panel */}
        <ContextPanel
          isOpen={contextOpen}
          onClose={() => setContextOpen(false)}
        />
      </div>

      </div>
    </TooltipProvider>
  );
}
