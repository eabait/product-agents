'use client'

import { useState } from 'react'
import { Save, X } from 'lucide-react'

export interface AgentSettings {
  model: string
  temperature: number
  maxTokens: number
  apiKey?: string
  advanced?: Record<string, any>
}

export interface SettingsPanelProps {
  settings: AgentSettings
  onSave: (_settings: AgentSettings) => void
  onClose: () => void
  availableModels?: string[]
  agentSpecificSettings?: React.ReactNode
}

export function SettingsPanel({
  settings,
  onSave,
  onClose,
  availableModels = [
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-haiku',
    'openai/gpt-4-turbo',
    'openai/gpt-3.5-turbo',
    'meta-llama/llama-3.1-70b-instruct'
  ],
  agentSpecificSettings
}: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState(settings)
  
  const handleSave = () => {
    onSave(localSettings)
    onClose()
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Agent Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {/* Model Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Model
            </label>
            <select
              value={localSettings.model}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                model: e.target.value
              })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableModels.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          
          {/* Temperature */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Temperature: {localSettings.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={localSettings.temperature}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                temperature: parseFloat(e.target.value)
              })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Precise</span>
              <span>Balanced</span>
              <span>Creative</span>
            </div>
          </div>
          
          {/* Max Tokens */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Max Tokens
            </label>
            <input
              type="number"
              value={localSettings.maxTokens}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                maxTokens: parseInt(e.target.value)
              })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* OpenRouter API Key */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              OpenRouter API Key (Optional)
            </label>
            <input
              type="password"
              value={localSettings.apiKey || ''}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                apiKey: e.target.value
              })}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to use environment variable
            </p>
          </div>
          
          {/* Agent-specific settings */}
          {agentSpecificSettings && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Advanced Settings</h3>
              {agentSpecificSettings}
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
