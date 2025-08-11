"use client";

import React, { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessages } from "@/components/chat/ChatMessages";
import {
  Menu,
  Plus,
  MessageCircle,
  Send,
  Settings,
  Loader,
} from "lucide-react";
import { Conversation, Message } from "@/types";
import { PRD } from "@/lib/prd-schema";

export default function PRDAgentPage() {
  const [open, setOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // track initialization so we don't run sync effects before we've loaded from localStorage
  const isInitializedRef = useRef(false);

  // Computed helpers for working with active conversation
  const activeConversation = conversations.find(c => c.id === activeId);
  const activeMessages = activeConversation?.messages || [];

  // Helper to update the active conversation
  const updateActiveConversation = (updater: (conv: Conversation) => Conversation) => {
    if (!activeId) return;
    setConversations(prev => 
      prev.map(c => c.id === activeId ? updater(c) : c)
    );
  };

  // ---------- Initialization (load from localStorage) ----------
  useEffect(() => {
    console.log("Initializing from localStorage...");
    try {
      const raw = localStorage.getItem("prd-agent-conversations");
      const activeRaw = localStorage.getItem("prd-agent-active-conversation");
      
      console.log("Raw localStorage data:", { raw, activeRaw });

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
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
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
      updateActiveConversation(conv => ({ ...conv, messages: finalMessages }));
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
        timestamp: new Date(),
      };
      const finalMessages = [...newMessages, errorMessage];
      updateActiveConversation(conv => ({ ...conv, messages: finalMessages }));
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="h-14 flex flex-row items-center gap-4 px-4 border-b">
        <button
          aria-label="Toggle sidebar"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center p-2 rounded-md hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex-1">
          <h1 className="text-lg font-semibold">PRD Generator Agent</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">
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
            open ? "w-72" : "w-16"
          } transition-all duration-200 border-r bg-sidebar-background overflow-hidden flex flex-col`}
        >
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-muted px-2 py-1 text-sm font-medium">
                PRD
              </div>
              {open && (
                <div className="text-sm font-semibold">Conversations</div>
              )}
            </div>
            {open && (
              <Button size="sm" variant="outline" onClick={createConversation}>
                <Plus className="h-4 w-4 mr-2" /> New
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-auto px-2 py-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => {
                  setActiveId(conv.id);
                }}
                className={`w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-accent ${
                  conv.id === activeId ? "ring-2 ring-sidebar-ring" : ""
                }`}
                title={conv.title}
              >
                <MessageCircle className="h-5 w-5" />
                {open && (
                  <div className="flex-1">
                    <div className="font-medium text-sm truncate">{conv.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(conv.createdAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </button>
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
                  Ask the agent to generate or edit a PRD. Try: "Create a PRD for a mobile payment app"
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
      </div>
    </div>
  );
}
