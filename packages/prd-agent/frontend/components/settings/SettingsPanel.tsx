'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Settings } from 'lucide-react'
import { formatContextWindow } from '@/lib/context-utils'
import { useModelContext, useContextSettings } from '@/contexts/AppStateProvider'
import {
  UI_DIMENSIONS,
  VALIDATION_LIMITS,
  SLIDER_CONFIGS,
  ICON_SIZES
} from '@/lib/ui-constants'

interface Model {
  id: string
  name: string
  provider: string
  contextLength: number
  isTopProvider?: boolean
  isModerated?: boolean
  pricing: {
    promptFormatted: string
    completionFormatted: string
  }
}

interface Provider {
  name: string
  count: number
  isTopProvider?: boolean
}

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  settings: {
    model: string
    temperature: number
    maxTokens: number
    apiKey?: string
    streaming?: boolean
  }
  // eslint-disable-next-line no-unused-vars
  onSettingsChange: (settings: any) => void
}

export function SettingsPanel({ isOpen, onClose, settings, onSettingsChange }: SettingsPanelProps) {
  const [models, setModels] = useState<Model[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    // Extract provider from current model
    return settings.model ? settings.model.split('/')[0] : ''
  })

  // Use reactive contexts
  const { setModels: setModelContextModels, updateModelFromId } = useModelContext()
  const { contextSettings, updateContextSettings } = useContextSettings()

  const availableProviders = models.reduce<Provider[]>((acc, model) => {
    const existing = acc.find(p => p.name === model.provider)
    if (existing) {
      existing.count++
      if (model.isTopProvider) existing.isTopProvider = true
    } else {
      acc.push({
        name: model.provider,
        count: 1,
        isTopProvider: model.isTopProvider
      })
    }
    return acc
  }, [])

  const modelsForProvider = models.filter(model => model.provider === selectedProvider)

  const setSettings = (updater: (_prev: any) => any) => {
    onSettingsChange(updater(settings))
  }

  const fetchModels = async (apiKey?: string) => {
    try {
      setModelsLoading(true)
      setModelsError(null)
      
      const params = new URLSearchParams()
      if (apiKey) params.append('apiKey', apiKey)
      
      const response = await fetch(`/api/models?${params}`)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || `HTTP ${response.status}`)
      }
      
      const data = await response.json()
      if (data.models && Array.isArray(data.models)) {
        setModels(data.models)
        // Update the model context as well
        setModelContextModels(data.models)
      } else {
        throw new Error('Invalid models data format')
      }
    } catch (error) {
      console.error('Error fetching models:', error)
      setModelsError(error instanceof Error ? error.message : 'Unknown error')
      // Use fallback models if needed
      setModels([])
    } finally {
      setModelsLoading(false)
    }
  }

  // Fetch models when panel opens or settings change
  useEffect(() => {
    if (isOpen) {
      fetchModels(settings.apiKey)
    }
  }, [isOpen, settings.apiKey])

  // Update provider when model changes
  useEffect(() => {
    if (settings.model) {
      const provider = settings.model.split('/')[0]
      setSelectedProvider(provider)
    }
  }, [settings.model])


  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className={`${UI_DIMENSIONS.SETTINGS_PANEL_WIDTH} p-0 overflow-hidden`}>
        <div className="flex flex-col h-full">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center gap-2">
              <Settings className={ICON_SIZES.MEDIUM} />
              <SheetTitle>Settings</SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-6">
              {/* Model Configuration */}
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
                  Model Configuration
                </div>
                
                <div className="space-y-4">
                  {/* Provider Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-medium">Provider</label>
                      <div className="flex items-center gap-2">
                        {modelsLoading && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <div className={`${UI_DIMENSIONS.LOADING_INDICATOR_SIZE} border border-current border-t-transparent rounded-full animate-spin`} />
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
                                  ({provider.count} model{provider.count !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''})
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
                      onValueChange={(value: string) => {
                        setSettings(prev => ({ ...prev, model: value }))
                        // Update the model context
                        updateModelFromId(value)
                      }}
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
                                      <span className="font-medium">{formatContextWindow(model.contextLength)} context</span>
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
                        `${modelsForProvider.length} model${modelsForProvider.length !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''} available` :
                        `${availableProviders.length} provider${availableProviders.length !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''} available`
                      }
                      {modelsLoading && ' (loading...)'}
                    </p>
                    
                    {/* Current Model Information */}
                    {settings.model && models.length > 0 && (() => {
                      const currentModel = models.find(m => m.id === settings.model);
                      if (currentModel) {
                        const contextWindowSize = currentModel.contextLength;
                        const tokenLimit = Math.floor(contextWindowSize * (contextSettings.tokenLimitPercentage / 100));
                        
                        return (
                          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                            <div className="text-xs font-medium text-muted-foreground mb-2">Selected Model Details</div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span>Total Context Window:</span>
                                <span className="font-medium font-mono">{formatContextWindow(contextWindowSize)} tokens</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Your Context Limit:</span>
                                <span className="font-medium font-mono">{formatContextWindow(tokenLimit)} tokens</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Limit Percentage:</span>
                                <span className="font-medium">{contextSettings.tokenLimitPercentage}% of model window</span>
                              </div>
                              <div className="flex justify-between text-muted-foreground">
                                <span>Pricing (per 1M):</span>
                                <span>{currentModel.pricing.promptFormatted} / {currentModel.pricing.completionFormatted}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  
                  {/* Temperature */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Temperature: {settings.temperature}
                    </label>
                    <Slider
                      value={[settings.temperature]}
                      onValueChange={([value]) => setSettings(prev => ({ ...prev, temperature: value }))}
                      max={SLIDER_CONFIGS.TEMPERATURE.MAX}
                      min={SLIDER_CONFIGS.TEMPERATURE.MIN}
                      step={SLIDER_CONFIGS.TEMPERATURE.STEP}
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
                  
                  {/* Streaming Toggle */}
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="enableStreaming"
                      checked={settings.streaming || true}
                      onChange={(e) => setSettings(prev => ({ ...prev, streaming: e.target.checked }))}
                      className="rounded"
                    />
                    <label htmlFor="enableStreaming" className="text-sm font-medium">
                      Enable live progress updates (streaming)
                    </label>
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
                      Context Token Limit: {contextSettings.tokenLimitPercentage}%
                    </label>
                    <Slider
                      value={[contextSettings.tokenLimitPercentage]}
                      onValueChange={([value]) => {
                        updateContextSettings({ tokenLimitPercentage: value });
                      }}
                      max={SLIDER_CONFIGS.CONTEXT_TOKEN_LIMIT.MAX}
                      min={SLIDER_CONFIGS.CONTEXT_TOKEN_LIMIT.MIN}
                      step={SLIDER_CONFIGS.CONTEXT_TOKEN_LIMIT.STEP}
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
                      checked={contextSettings.autoIncludeCurrentPRD}
                      onChange={(e) => updateContextSettings({ 
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
        </div>
      </SheetContent>
    </Sheet>
  )
}