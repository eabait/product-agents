"use client";

import React, { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Menu,
  Plus,
  MessageCircle,
  Send,
  Settings,
  Loader,
} from "lucide-react";
import { Conversation, Message } from "@/types";

export default function PRDAgentPage() {
  const [open, setOpen] = useState(true); // sidebar open/collapsed
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // basic localStorage-backed init
    try {
      const raw = localStorage.getItem("prd:convs");
      if (raw) {
        const parsed = JSON.parse(raw);
        setConversations(parsed);
        if (parsed.length) setActiveId(parsed[0].id);
      } else {
        const id = uuidv4();
        const initial: Conversation = {
          id,
          title: "New PRD",
          messages: [],
          createdAt: new Date().toISOString(),
        };
        setConversations([initial]);
        setActiveId(id);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("prd:convs", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    // autoscroll
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [conversations, activeId]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const active = conversations.find((c) => c.id === activeId) || null;

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

  async function sendPrompt() {
    if (!active || !input.trim() || loading) return;
    const userMsg: Message = {
      id: uuidv4(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === active.id ? { ...c, messages: [...c.messages, userMsg] } : c
      )
    );
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          existingPRD: null,
          isEdit: false,
        }),
      });
      const data = await res.json();
      const prdText =
        data && data.prd
          ? JSON.stringify(data.prd, null, 2)
          : data?.message || JSON.stringify(data);
      const assistant: Message = {
        id: uuidv4(),
        role: "assistant",
        content: typeof prdText === "string" ? prdText : String(prdText),
        timestamp: new Date(),
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === active.id
            ? { ...c, messages: [...c.messages, assistant] }
            : c
        )
      );
    } catch (e) {
      console.error(e);
      const errMsg: Message = {
        id: uuidv4(),
        role: "assistant",
        content: "Error: failed to get response",
        timestamp: new Date(),
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === active.id ? { ...c, messages: [...c.messages, errMsg] } : c
        )
      );
    } finally {
      setLoading(false);
    }
  }

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
                onClick={() => setActiveId(conv.id)}
                className={`w-full text-left flex items-center gap-3 p-2 rounded-md hover:bg-accent ${
                  conv.id === activeId ? "ring-2 ring-sidebar-ring" : ""
                }`}
                title={conv.title}
              >
                <MessageCircle className="h-5 w-5" />
                {open && (
                  <div className="flex-1">
                    <div className="font-medium text-sm truncate">
                      {conv.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(conv.createdAt).toLocaleString()}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>

          <div className="p-3 border-t">
            {open ? (
              <div className="flex gap-2">
                <Button size="sm" variant="ghost">
                  Import
                </Button>
                <Button size="sm" variant="ghost">
                  Export
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="text-xs text-muted-foreground">...</div>
              </div>
            )}
          </div>
        </aside>

        {/* Right chat area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Messages scroll area */}
          <div ref={scrollRef} className="flex-1 overflow-auto p-6">
            {!active || active.messages.length === 0 ? (
              <div className="mx-auto max-w-2xl text-center py-24">
                <h2 className="text-2xl font-bold mb-2">
                  Welcome to PRD Agent
                </h2>
                <p className="text-muted-foreground mb-6">
                  Ask the agent to generate or edit a PRD. Try: "Create a PRD
                  for a mobile payment app"
                </p>
                <div className="grid gap-2">
                  <button
                    className="rounded-md border p-3 text-left hover:bg-accent"
                    onClick={() =>
                      setInput("Create a PRD for a mobile payment app")
                    }
                  >
                    Create a PRD for a mobile payment app
                  </button>
                  <button
                    className="rounded-md border p-3 text-left hover:bg-accent"
                    onClick={() =>
                      setInput(
                        "Create a PRD for an AI customer support chatbot"
                      )
                    }
                  >
                    Create a PRD for an AI customer support chatbot
                  </button>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4">
                {active.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      } rounded-lg px-4 py-3 max-w-[80%] whitespace-pre-wrap`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-3">
                    <div className="rounded-full bg-primary text-primary-foreground h-8 w-8 flex items-center justify-center">
                      <Loader className="h-4 w-4 animate-spin" />
                    </div>
                    <div className="rounded-lg bg-muted px-4 py-3">
                      Thinking...
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t p-4 bg-card">
            <div className="mx-auto max-w-3xl">
              <div className="flex gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendPrompt();
                    }
                  }}
                  placeholder="Type your requirements or prompt..."
                  className="min-h-[48px] resize-none"
                  rows={1}
                />

                <Button
                  onClick={() => void sendPrompt()}
                  disabled={!input.trim() || loading}
                  size="icon"
                >
                  {loading ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
