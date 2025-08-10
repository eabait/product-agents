'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Settings, Loader, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    model?: string
    tokens?: number
    duration?: number
    confidence?: number
  }
}

export interface ChatUIProps {
  agentName: string
  agentDescription: string
  onSendMessage: (message: string) => Promise<void>
  messages: Message[]
  isProcessing: boolean
  capabilities?: string[]
  suggestions?: string[]
  onSettingsClick?: () => void
}

export function ChatUI({
  agentName,
  agentDescription,
  onSendMessage,
  messages,
  isProcessing,
  capabilities = [],
  suggestions = [],
  onSettingsClick
}: ChatUIProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  const handleSend = async () => {
    if (!input.trim() || isProcessing) return
    
    const message = input
    setInput('')
    await onSendMessage(message)
  }
  
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Bot className="w-6 h-6 text-blue-600" />
              {agentName}
            </h1>
            <p className="text-sm text-gray-600">{agentDescription}</p>
          </div>
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          )}
        </div>
        
        {/* Capabilities */}
        {capabilities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {capabilities.map((cap, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
              >
                {cap}
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        
        {isProcessing && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader className="w-4 h-4 animate-spin" />
            <span className="text-sm">Processing...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Suggestions */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="px-6 py-3 border-t bg-white">
          <p className="text-xs text-gray-500 mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setInput(suggestion)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Input */}
      <div className="border-t bg-white px-6 py-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            disabled={isProcessing}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg' : 'bg-gradient-to-br from-gray-100 to-gray-200 border'
        }`}>
          {isUser ? (
            <User className="w-5 h-5 text-white" />
          ) : (
            <Bot className="w-5 h-5 text-gray-700" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className={`relative px-4 py-3 rounded-2xl shadow-sm ${
            isUser 
              ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white ml-4' 
              : 'bg-white border border-gray-200 mr-4'
          }`}>
            {/* Copy button */}
            {!isUser && (
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded"
                title="Copy message"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-green-600" />
                ) : (
                  <Copy className="w-3 h-3 text-gray-500" />
                )}
              </button>
            )}
            
            <div className={`${isUser ? 'text-white' : 'text-gray-900'}`}>
              {isUser ? (
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
              ) : (
                <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-800 prose-strong:text-gray-900 prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-50 prose-pre:border prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-50 prose-ul:text-gray-800 prose-ol:text-gray-800 prose-li:text-gray-800">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code: ({ children, className, ...props }: any) => {
                        const isInline = !className?.includes('language-')
                        if (isInline) {
                          return (
                            <code className="bg-blue-50 text-blue-700 px-1 py-0.5 rounded text-sm font-mono" {...props}>
                              {children}
                            </code>
                          )
                        }
                        return (
                          <pre className="bg-gray-50 border rounded-lg p-3 overflow-x-auto">
                            <code className="text-sm font-mono text-gray-800" {...props}>
                              {children}
                            </code>
                          </pre>
                        )
                      },
                      h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-lg font-semibold text-gray-900 mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-semibold text-gray-900 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="text-gray-800 mb-2 last:mb-0">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside text-gray-800 mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-inside text-gray-800 mb-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-gray-800">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-blue-500 bg-blue-50 pl-4 py-2 my-2 italic">
                          {children}
                        </blockquote>
                      ),
                      strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                      em: ({ children }) => <em className="italic text-gray-800">{children}</em>,
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-2">
                          <table className="min-w-full border border-gray-200 rounded-lg">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
                      th: ({ children }) => <th className="px-3 py-2 text-left text-sm font-semibold text-gray-900 border-b">{children}</th>,
                      td: ({ children }) => <td className="px-3 py-2 text-sm text-gray-800 border-b">{children}</td>,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
          
          {/* Metadata */}
          <div className="flex items-center justify-between mt-1 px-1">
            <div className="text-xs text-gray-500">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            {message.metadata && (
              <div className="text-xs text-gray-500 flex gap-3">
                {message.metadata.model && (
                  <span className="bg-gray-100 px-2 py-0.5 rounded-full">
                    {message.metadata.model.split('/').pop()}
                  </span>
                )}
                {message.metadata.confidence && (
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    {Math.round(message.metadata.confidence * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
