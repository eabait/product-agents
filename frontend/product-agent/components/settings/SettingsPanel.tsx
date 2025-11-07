'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Settings, ChevronDown } from 'lucide-react'
import { formatContextWindow } from '@/lib/context-utils'
import { useModelContext, useContextSettings } from '@/contexts/AppStateProvider'
import {
  UI_DIMENSIONS,
  VALIDATION_LIMITS,
  SLIDER_CONFIGS,
  ICON_SIZES
} from '@/lib/ui-constants'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { AgentMetadata, AgentSettingsState, SubAgentMetadata, SubAgentSettingsMap } from '@/types'

type RuntimeOverrides = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

type ResolvedRuntime = {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
}

interface Model {
  id: string
  name: string
  provider: string
  contextLength: number
  isTopProvider?: boolean
  isModerated?: boolean
  capabilities: string[]
  isRecommended?: boolean
  recommendedReason?: string
  pricing: {
    promptFormatted: string
    completionFormatted: string
  }
}

interface Provider {
  name: string
  count: number
  isTopProvider?: boolean
  hasRecommended?: boolean
}

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
  settings: AgentSettingsState
  metadata: AgentMetadata | null
  // eslint-disable-next-line no-unused-vars
  onSettingsChange: (settings: AgentSettingsState) => void
}

const formatCapabilityLabel = (capability: string) =>
  capability
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())

type SettingsGroupId = 'openrouter' | 'model' | 'streaming' | 'context'

const DEFAULT_SETTINGS_GROUP: SettingsGroupId = 'openrouter'

const SETTINGS_GROUPS: Array<{
  id: SettingsGroupId
  label: string
  description: string
}> = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Configure credentials and keep model availability in sync.'
  },
  {
    id: 'model',
    label: 'Model',
    description: 'Set orchestrator defaults and fine-tune sub-agent overrides.'
  },
  {
    id: 'streaming',
    label: 'Streaming',
    description: 'Control real-time updates during runs.'
  },
  {
    id: 'context',
    label: 'Context',
    description: 'Decide how much project context is injected into prompts.'
  }
]

const SETTINGS_GROUP_IDS = new Set<SettingsGroupId>(SETTINGS_GROUPS.map(group => group.id))

const isSettingsGroupId = (value: string): value is SettingsGroupId =>
  SETTINGS_GROUP_IDS.has(value as SettingsGroupId)

const BASE_ARTIFACT_OPTIONS = [
  {
    id: 'prd',
    label: 'Product Requirements Document (PRD)',
    description: 'Generate, edit, and stream PRDs with section-aware controls.',
    available: true
  },
  {
    id: 'persona',
    label: 'Persona Builder',
    description: 'Draft personas from PRD context when the persona subagent is enabled.',
    available: false
  },
  {
    id: 'research',
    label: 'Research Summaries',
    description: 'Synthesize research briefs and data pulls. Coming soon.',
    available: false
  },
  {
    id: 'story-map',
    label: 'Story Mapping',
    description: 'Translate requirements into user story maps. Coming soon.',
    available: false
  }
] as const

export function SettingsPanel({ isOpen, onClose, metadata, settings, onSettingsChange }: SettingsPanelProps) {
  const [models, setModels] = useState<Model[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [subAgentDropdownState, setSubAgentDropdownState] = useState<Record<string, { providerOpen: boolean; modelOpen: boolean }>>({})
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_SETTINGS_GROUP
    }
    try {
      const stored = window.localStorage.getItem('settings-active-group')
      if (stored && isSettingsGroupId(stored)) {
        return stored
      }
    } catch (error) {
      console.warn('Failed to read active settings group from storage:', error)
    }
    return DEFAULT_SETTINGS_GROUP
  })
  const [lastModelRefresh, setLastModelRefresh] = useState<Date | null>(null)
  const [lastFetchStatus, setLastFetchStatus] = useState<'success' | 'error' | null>(null)
  const [lastFetchAction, setLastFetchAction] = useState<'refresh' | 'test' | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    // Extract provider from current model
    return settings.model ? settings.model.split('/')[0] : ''
  })

  const personaMetadata = metadata?.subAgents?.find(subAgent => subAgent.id === 'persona.builder')
  const artifactOptions = BASE_ARTIFACT_OPTIONS.map(option =>
    option.id === 'persona'
      ? { ...option, available: Boolean(personaMetadata) }
      : option
  )

  // Use reactive contexts
  const { setModels: setModelContextModels, updateModelFromId } = useModelContext()
  const { contextSettings, updateContextSettings } = useContextSettings()

  const availableProviders = models.reduce<Provider[]>((acc, model) => {
    const existing = acc.find(p => p.name === model.provider)
    if (existing) {
      existing.count++
      if (model.isTopProvider) existing.isTopProvider = true
      if (model.isRecommended) existing.hasRecommended = true
    } else {
      acc.push({
        name: model.provider,
        count: 1,
        isTopProvider: model.isTopProvider,
        hasRecommended: !!model.isRecommended
      })
    }
    return acc
  }, [])

  const modelsForProvider = models.filter(model => model.provider === selectedProvider)
  const currentModel = settings.model ? models.find(model => model.id === settings.model) : undefined

  useEffect(() => {
    if (!personaMetadata && settings.artifactTypes?.includes('persona')) {
      onSettingsChange({
        ...settings,
        artifactTypes: settings.artifactTypes.filter(id => id !== 'persona')
      })
    }
  }, [personaMetadata, settings, onSettingsChange])
  const getSubAgentDropdownState = (id: string) => {
    const state = subAgentDropdownState[id]
    if (state) {
      return state
    }
    const fallback = { providerOpen: false, modelOpen: false } as const
    return fallback
  }
  const setSubAgentDropdown = (
    id: string,
    update:
      | Partial<{ providerOpen: boolean; modelOpen: boolean }>
      | ((_state: { providerOpen: boolean; modelOpen: boolean }) => { providerOpen: boolean; modelOpen: boolean })
  ) => {
    setSubAgentDropdownState(prev => {
      const snapshot = getSubAgentDropdownState(id)
      const next = typeof update === 'function'
        ? update(snapshot)
        : {
            providerOpen: update.providerOpen ?? snapshot.providerOpen,
            modelOpen: update.modelOpen ?? snapshot.modelOpen
          }
      return {
        ...prev,
        [id]: next
      }
    })
  }

  const cloneSettings = (): AgentSettingsState => ({
    ...settings,
    subAgentSettings: Object.entries(settings.subAgentSettings || {}).reduce<SubAgentSettingsMap>((acc, [key, value]) => {
      acc[key] = { ...value }
      return acc
    }, {}),
    artifactTypes: Array.isArray(settings.artifactTypes) && settings.artifactTypes.length > 0
      ? [...settings.artifactTypes]
      : ['prd']
  })

  const setSettings = (updater: (_prev: AgentSettingsState) => AgentSettingsState) => {
    onSettingsChange(updater(cloneSettings()))
  }

  const toggleArtifactType = (artifactId: string) => {
    setSettings(prev => {
      const selection = Array.isArray(prev.artifactTypes) ? prev.artifactTypes : ['prd']
      const hasArtifact = selection.includes(artifactId)

      if (hasArtifact) {
        if (selection.length <= 1) {
          return prev
        }
        return {
          ...prev,
          artifactTypes: selection.filter(id => id !== artifactId)
        }
      }

      return {
        ...prev,
        artifactTypes: [...selection, artifactId]
      }
    })
  }

  const fetchModels = async (apiKey?: string): Promise<boolean> => {
    let didSucceed = false
    try {
      setModelsLoading(true)
      setModelsError(null)
      setLastFetchStatus(null)
      
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
        setLastFetchStatus('success')
        setLastModelRefresh(new Date())
        didSucceed = true
      } else {
        throw new Error('Invalid models data format')
      }
    } catch (error) {
      console.error('Error fetching models:', error)
      setModelsError(error instanceof Error ? error.message : 'Unknown error')
      // Use fallback models if needed
      setModels([])
      setLastFetchStatus('error')
    } finally {
      setModelsLoading(false)
    }
    return didSucceed
  }

  const subAgents: SubAgentMetadata[] = metadata?.subAgents || []
  const agentDefaults = metadata?.defaultSettings

  const resolveBaselineForSubAgent = (subAgent: SubAgentMetadata) => ({
    model: subAgent.defaultSettings?.model ?? agentDefaults?.model ?? settings.model,
    temperature: subAgent.defaultSettings?.temperature ?? agentDefaults?.temperature ?? settings.temperature,
    maxTokens: subAgent.defaultSettings?.maxTokens ?? agentDefaults?.maxTokens ?? settings.maxTokens
  })

  const resolveSubAgentSettings = (subAgent: SubAgentMetadata) => {
    const baseline = resolveBaselineForSubAgent(subAgent)
    const overrides = settings.subAgentSettings?.[subAgent.id]
    return {
      ...baseline,
      ...overrides
    }
  }

  const getCompatibleModels = (subAgent: SubAgentMetadata) => {
    if (subAgent.requiredCapabilities.length === 0) {
      return models
    }
    return models.filter(model => {
      const caps = model.capabilities || []
      return subAgent.requiredCapabilities.every(capability => caps.includes(capability))
    })
  }

  const hasSubAgentOverride = (subAgent: SubAgentMetadata) => {
    const baseline = resolveBaselineForSubAgent(subAgent)
    const overrides = settings.subAgentSettings?.[subAgent.id]
    if (!overrides) return false

    return (
      overrides.model !== baseline.model ||
      overrides.temperature !== baseline.temperature ||
      overrides.maxTokens !== baseline.maxTokens
    )
  }

  const updateSubAgentSettings = (
    subAgentId: string,
    updater: (_current: ResolvedRuntime) => Partial<ResolvedRuntime>
  ) => {
    setSettings(prev => {
      const next = { ...prev }
      const currentOverrides: RuntimeOverrides = next.subAgentSettings?.[subAgentId] || {}
      const baseline: ResolvedRuntime = {
        model: currentOverrides.model ?? next.model,
        temperature: currentOverrides.temperature ?? next.temperature,
        maxTokens: currentOverrides.maxTokens ?? next.maxTokens,
        apiKey: currentOverrides.apiKey ?? next.apiKey
      }
      const overrides = updater(baseline) || {}
      next.subAgentSettings = {
        ...next.subAgentSettings,
        [subAgentId]: {
          model: overrides.model ?? baseline.model,
          temperature: overrides.temperature ?? baseline.temperature,
          maxTokens: overrides.maxTokens ?? baseline.maxTokens,
          apiKey: overrides.apiKey ?? baseline.apiKey
        }
      }
      return next
    })
  }

  const resetSubAgentSettings = (subAgent: SubAgentMetadata) => {
    setSettings(prev => {
      const next = { ...prev }
      const baseline = resolveBaselineForSubAgent(subAgent)
      next.subAgentSettings = {
        ...next.subAgentSettings,
        [subAgent.id]: { ...baseline }
      }
      return next
    })
  }

  // Fetch models when panel opens or settings change
  useEffect(() => {
    if (isOpen) {
      setLastFetchAction('refresh')
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem('settings-active-group', activeGroup)
    } catch (error) {
      console.warn('Failed to persist active settings group:', error)
    }
  }, [activeGroup])

  const handleRefreshModels = () => {
    setLastFetchAction('refresh')
    void fetchModels(settings.apiKey)
  }

  const handleTestConnection = () => {
    setLastFetchAction('test')
    void fetchModels(settings.apiKey)
  }

  const activeGroupMeta =
    SETTINGS_GROUPS.find(group => group.id === activeGroup) ?? SETTINGS_GROUPS[0]
  const streamingEnabled = settings.streaming ?? true
  const streamingSupported = currentModel?.capabilities?.includes('streaming') ?? false
  const contextLimitTokens = currentModel
    ? Math.floor(currentModel.contextLength * (contextSettings.tokenLimitPercentage / 100))
    : null
  const subAgentOverrideCount = subAgents.filter(hasSubAgentOverride).length
  const availableProviderCount = availableProviders.length

  const groupContent = (() => {
    switch (activeGroup) {
      case 'openrouter':
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="openrouterApiKey" className="block text-sm font-medium">
                OpenRouter API Key
              </label>
              <Input
                id="openrouterApiKey"
                type="password"
                value={settings.apiKey || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-or-..."
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the environment variable during development or deployment.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div>
                <p className="text-sm font-medium">Model availability</p>
                <p className="text-xs text-muted-foreground">
                  {modelsLoading
                    ? 'Fetching models from OpenRouter...'
                    : modelsError
                      ? `Unable to fetch models: ${modelsError}`
                      : models.length > 0
                        ? `Loaded ${models.length} model${models.length !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''} across ${availableProviderCount} provider${availableProviderCount !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''}.`
                        : 'No models loaded yet. Enter an API key and refresh.'}
                </p>
                {lastModelRefresh && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last checked: {lastModelRefresh.toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRefreshModels}
                  disabled={modelsLoading}
                >
                  Refresh models
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={modelsLoading}
                >
                  Test connection
                </Button>
              </div>

              {lastFetchStatus === 'success' && !modelsError && (
                <div className="text-xs text-green-600">
                  {lastFetchAction === 'test'
                    ? 'API key verified successfully.'
                    : 'Model catalog refreshed.'}
                </div>
              )}
              {lastFetchStatus === 'error' && modelsError && (
                <div className="text-xs text-red-500">
                  {lastFetchAction === 'test'
                    ? 'API key test failed.'
                    : 'Unable to refresh models.'}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Provider and model pickers become interactive once models are fetched successfully.
            </div>
          </div>
        )

      case 'model': {
        const recommendedProviders = availableProviders.filter(provider => provider.hasRecommended)
        const additionalProviders = recommendedProviders.length > 0
          ? availableProviders.filter(provider => !provider.hasRecommended)
          : availableProviders
        const recommendedModelsForProvider = modelsForProvider.filter(model => model.isRecommended)
        const additionalModelsForProvider = recommendedModelsForProvider.length > 0
          ? modelsForProvider.filter(model => !model.isRecommended)
          : modelsForProvider

        const renderProviderOption = (provider: Provider) => (
          <SelectItem key={provider.name} value={provider.name}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{provider.name}</span>
                {provider.isTopProvider && (
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex-shrink-0">
                    ⭐ Top
                  </span>
                )}
                {provider.hasRecommended && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
                    Recommended
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                ({provider.count} model{provider.count !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''})
              </span>
            </div>
          </SelectItem>
        )

        const renderModelOption = (model: Model) => (
          <SelectItem key={model.id} value={model.id}>
            <div className="flex flex-col gap-1">
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
                {model.isRecommended && (
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
                    Recommended
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                <span className="font-medium">{formatContextWindow(model.contextLength)} context</span>
                <span>{model.pricing.promptFormatted}/{model.pricing.completionFormatted} per 1M</span>
              </div>
              {model.recommendedReason && (
                <p className="text-xs text-muted-foreground italic">{model.recommendedReason}</p>
              )}
              {model.capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {model.capabilities.map(capability => (
                    <span
                      key={`${model.id}-${capability}`}
                      className="rounded bg-muted px-1.5 py-0.5"
                    >
                      {formatCapabilityLabel(capability)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SelectItem>
        )

        const selectPlaceholder = !selectedProvider
          ? 'Select a provider first'
          : modelsLoading
            ? 'Loading models...'
            : 'Select a model'

        return (
          <div className="space-y-8">
            <div className="rounded-md border p-4 space-y-3 bg-muted/20">
              <div>
                <h3 className="text-sm font-semibold">Artifact Types</h3>
                <p className="text-xs text-muted-foreground">
                  Choose which artifacts the product agent should generate. PRD stays enabled by default.
                </p>
              </div>
              <div className="space-y-2">
                {artifactOptions.map(option => {
                  const checked = settings.artifactTypes?.includes(option.id) ?? false
                  const disabled = !option.available
                  const lockChecked = option.id === 'prd' && (settings.artifactTypes?.length ?? 0) <= 1

                  return (
                    <label
                      key={option.id}
                      className={`flex items-start gap-3 rounded-md border px-3 py-2 ${
                        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-background'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-muted-foreground/40"
                        checked={checked}
                        disabled={disabled || lockChecked}
                        onChange={() => {
                          if (disabled) return
                          toggleArtifactType(option.id)
                        }}
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{option.label}</span>
                          {!option.available && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {option.id === 'persona' ? 'Enable persona subagent in backend' : 'Coming soon'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium" htmlFor="providerSelect">
                    Provider
                  </label>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {modelsLoading && (
                      <div className="flex items-center gap-1">
                        <div className={`${UI_DIMENSIONS.LOADING_INDICATOR_SIZE} border border-current border-t-transparent rounded-full animate-spin`} />
                        Loading...
                      </div>
                    )}
                    {!modelsLoading && modelsError && (
                      <span className="text-red-500">Fetch error</span>
                    )}
                  </div>
                </div>
                <Select
                  value={selectedProvider}
                  open={providerDropdownOpen}
                  onOpenChange={(open) => {
                    setProviderDropdownOpen(open)
                    if (open) {
                      setModelDropdownOpen(false)
                    }
                  }}
                  onValueChange={(value: string) => {
                    setSelectedProvider(value)
                    setProviderDropdownOpen(false)
                    const preferredModel =
                      models.find(model => model.provider === value && model.isRecommended) ||
                      models.find(model => model.provider === value)
                    if (preferredModel) {
                      setSettings(prev => ({ ...prev, model: preferredModel.id }))
                    }
                  }}
                  disabled={modelsLoading || availableProviderCount === 0}
                >
                  <SelectTrigger id="providerSelect">
                    <SelectValue placeholder={modelsLoading ? 'Loading providers...' : 'Select a provider'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.length === 0 && !modelsLoading ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        {modelsError
                          ? `Error: ${modelsError}`
                          : 'No providers available. Test your API key from the OpenRouter tab.'}
                      </div>
                    ) : (
                      <>
                        {recommendedProviders.length > 0 && (
                          <>
                            <SelectGroup>
                              <SelectLabel>Recommended</SelectLabel>
                              {recommendedProviders.map(renderProviderOption)}
                            </SelectGroup>
                            {additionalProviders.length > 0 && <SelectSeparator />}
                          </>
                        )}
                        {additionalProviders.length > 0 && (
                          <SelectGroup>
                            {recommendedProviders.length > 0 && (
                              <SelectLabel>All Providers</SelectLabel>
                            )}
                            {additionalProviders.map(renderProviderOption)}
                          </SelectGroup>
                        )}
                        {recommendedProviders.length === 0 && additionalProviders.length === 0 && (
                          <SelectGroup>
                            {availableProviders.map(renderProviderOption)}
                          </SelectGroup>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" htmlFor="modelSelect">
                  Model
                </label>
                <Select
                  value={settings.model}
                  open={modelDropdownOpen}
                  onOpenChange={(open) => {
                    setModelDropdownOpen(open)
                    if (open) {
                      setProviderDropdownOpen(false)
                    }
                  }}
                  onValueChange={(value: string) => {
                    setSettings(prev => ({ ...prev, model: value }))
                    updateModelFromId(value)
                    setModelDropdownOpen(false)
                  }}
                  disabled={modelsLoading || !selectedProvider}
                >
                  <SelectTrigger id="modelSelect">
                    <SelectValue placeholder={selectPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {modelsForProvider.length === 0 && !modelsLoading && selectedProvider ? (
                      <div className="p-2 text-sm text-muted-foreground text-center">
                        No models available for {selectedProvider}
                      </div>
                    ) : (
                      <>
                        {recommendedModelsForProvider.length > 0 && (
                          <>
                            <SelectGroup>
                              <SelectLabel>Recommended</SelectLabel>
                              {recommendedModelsForProvider.map(renderModelOption)}
                            </SelectGroup>
                            {additionalModelsForProvider.length > 0 && <SelectSeparator />}
                          </>
                        )}
                        {additionalModelsForProvider.length > 0 && (
                          <SelectGroup>
                            {recommendedModelsForProvider.length > 0 && (
                              <SelectLabel>More Models</SelectLabel>
                            )}
                            {additionalModelsForProvider.map(renderModelOption)}
                          </SelectGroup>
                        )}
                        {recommendedModelsForProvider.length === 0 && additionalModelsForProvider.length === 0 && (
                          <SelectGroup>
                            {modelsForProvider.map(renderModelOption)}
                          </SelectGroup>
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {modelsError && (
                  <p className="text-xs text-red-500 mt-1">
                    {modelsError}. Using fallback models.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedProvider
                    ? `${modelsForProvider.length} model${modelsForProvider.length !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''} available`
                    : `${availableProviderCount} provider${availableProviderCount !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''} available`}
                  {modelsLoading && ' (loading...)'}
                </p>

                {currentModel && (
                  <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Selected Model Details</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Total Context Window:</span>
                        <span className="font-medium font-mono">{formatContextWindow(currentModel.contextLength)} tokens</span>
                      </div>
                      {contextLimitTokens !== null && (
                        <div className="flex justify-between">
                          <span>Your Context Limit:</span>
                          <span className="font-medium font-mono">{formatContextWindow(contextLimitTokens)} tokens</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Limit Percentage:</span>
                        <span className="font-medium">{contextSettings.tokenLimitPercentage}% of model window</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Pricing (per 1M):</span>
                        <span>{currentModel.pricing.promptFormatted} / {currentModel.pricing.completionFormatted}</span>
                      </div>
                      {currentModel.capabilities.length > 0 && (
                        <div className="flex flex-wrap gap-1 text-[10px] uppercase tracking-wide text-muted-foreground pt-2 border-t border-muted/60 mt-2">
                          {currentModel.capabilities.map(capability => (
                            <span key={`selected-${capability}`} className="rounded bg-muted px-1.5 py-0.5">
                              {formatCapabilityLabel(capability)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Temperature: {settings.temperature.toFixed(2)}
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

              <div>
                <label className="block text-sm font-medium mb-2" htmlFor="maxTokensInput">
                  Max Tokens
                </label>
                <Input
                  id="maxTokensInput"
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => setSettings(prev => ({ ...prev, maxTokens: Number.parseInt(e.target.value, 10) }))}
                />
              </div>
            </div>

            {metadata && subAgents.length > 0 && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      Sub-agent Overrides
                    </div>
                    {subAgentOverrideCount > 0 && (
                      <div className="text-xs text-blue-600">
                        {subAgentOverrideCount} override{subAgentOverrideCount !== VALIDATION_LIMITS.SINGULAR_ITEM_COUNT ? 's' : ''} active
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Override individual worker settings when you need specialized models or tuning. Defaults inherit from the orchestrator if left unchanged.
                  </p>
                </div>

                <div className="space-y-3">
                  {subAgents.map((subAgent) => {
                    const currentSettings = resolveSubAgentSettings(subAgent)
                    const baselineSettings = resolveBaselineForSubAgent(subAgent)
                    const overrideActive = hasSubAgentOverride(subAgent)
                    const compatibleModels = getCompatibleModels(subAgent)

                    const providerOptions = compatibleModels.reduce<Provider[]>((acc, model) => {
                      const existing = acc.find(provider => provider.name === model.provider)
                      if (existing) {
                        existing.count += 1
                        if (model.isTopProvider) existing.isTopProvider = true
                        if (model.isRecommended) existing.hasRecommended = true
                      } else {
                        acc.push({
                          name: model.provider,
                          count: 1,
                          isTopProvider: model.isTopProvider,
                          hasRecommended: !!model.isRecommended
                        })
                      }
                      return acc
                    }, [])

                    const currentProvider = currentSettings.model?.split('/')[0]
                    const dropdownState = getSubAgentDropdownState(subAgent.id)
                    const recommendedProviderOptions = providerOptions.filter(provider => provider.hasRecommended)
                    const additionalProviderOptions = recommendedProviderOptions.length > 0
                      ? providerOptions.filter(provider => !provider.hasRecommended)
                      : providerOptions

                    const modelsForCurrentProvider = currentProvider
                      ? compatibleModels.filter(model => model.provider === currentProvider)
                      : []

                    const recommendedModelOptions = modelsForCurrentProvider.filter(model => model.isRecommended)
                    const additionalModelOptions = recommendedModelOptions.length > 0
                      ? modelsForCurrentProvider.filter(model => !model.isRecommended)
                      : modelsForCurrentProvider

                    return (
                      <Collapsible key={subAgent.id}>
                        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-sm">
                              {subAgent.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {subAgent.description}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {overrideActive ? (
                              <span className="text-xs text-blue-600 font-medium">Override active</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Using defaults</span>
                            )}
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-3 space-y-4 rounded-md border bg-background px-3 py-3">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Baseline: {baselineSettings.model}</span>
                            <button
                              type="button"
                              onClick={() => resetSubAgentSettings(subAgent)}
                              className="text-blue-600 hover:underline"
                            >
                              Reset to default
                            </button>
                          </div>

                          {compatibleModels.length === 0 ? (
                            <div className="rounded-md bg-red-50 p-3 text-xs text-red-600">
                              No models available that satisfy {subAgent.requiredCapabilities.join(', ')}. Fetch models with a broader API key or adjust requirements.
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <label className="block text-sm font-medium">Provider</label>
                                <Select
                                  value={currentProvider || undefined}
                                  open={dropdownState.providerOpen}
                                  onOpenChange={(open) => {
                                    setSubAgentDropdown(subAgent.id, (currentState) => ({
                                      providerOpen: open,
                                      modelOpen: open ? false : currentState.modelOpen
                                    }))
                                  }}
                                  onValueChange={(value: string) => {
                                    const preferredModel =
                                      compatibleModels.find(model => model.provider === value && model.isRecommended) ||
                                      compatibleModels.find(model => model.provider === value)
                                    if (preferredModel) {
                                      updateSubAgentSettings(subAgent.id, prev => ({
                                        ...prev,
                                        model: preferredModel.id
                                      }))
                                      setSubAgentDropdown(subAgent.id, { providerOpen: false, modelOpen: false })
                                    }
                                  }}
                                  disabled={modelsLoading}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder={modelsLoading ? 'Loading providers...' : 'Select a provider'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {recommendedProviderOptions.length > 0 && (
                                      <>
                                        <SelectGroup>
                                          <SelectLabel>Recommended</SelectLabel>
                                          {recommendedProviderOptions.map(renderProviderOption)}
                                        </SelectGroup>
                                        {additionalProviderOptions.length > 0 && <SelectSeparator />}
                                      </>
                                    )}
                                    {additionalProviderOptions.length > 0 && (
                                      <SelectGroup>
                                        {recommendedProviderOptions.length > 0 && (
                                          <SelectLabel>All Providers</SelectLabel>
                                        )}
                                        {additionalProviderOptions.map(renderProviderOption)}
                                      </SelectGroup>
                                    )}
                                    {recommendedProviderOptions.length === 0 && additionalProviderOptions.length === 0 && (
                                      <SelectGroup>
                                        {providerOptions.map(renderProviderOption)}
                                      </SelectGroup>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <label className="block text-sm font-medium mb-2">Model</label>
                                {(() => {
                                  if (!currentProvider) {
                                    return (
                                      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                        Select a provider to view compatible models.
                                      </div>
                                    )
                                  }

                                  if (modelsForCurrentProvider.length === 0) {
                                    return (
                                      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                        No compatible models for this provider.
                                      </div>
                                    )
                                  }

                                  return (
                                    <Select
                                      value={currentSettings.model}
                                      open={dropdownState.modelOpen}
                                      onOpenChange={(open) => {
                                        setSubAgentDropdown(subAgent.id, (currentState) => ({
                                          modelOpen: open,
                                          providerOpen: open ? false : currentState.providerOpen
                                        }))
                                      }}
                                      onValueChange={(value: string) => {
                                        updateSubAgentSettings(subAgent.id, prev => ({
                                          ...prev,
                                          model: value
                                        }))
                                        setSubAgentDropdown(subAgent.id, { modelOpen: false })
                                      }}
                                      disabled={modelsLoading}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a model" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {recommendedModelOptions.length > 0 && (
                                          <>
                                            <SelectGroup>
                                              <SelectLabel>Recommended</SelectLabel>
                                              {recommendedModelOptions.map(renderModelOption)}
                                            </SelectGroup>
                                            {additionalModelOptions.length > 0 && <SelectSeparator />}
                                          </>
                                        )}
                                        {additionalModelOptions.length > 0 && (
                                          <SelectGroup>
                                            {recommendedModelOptions.length > 0 && (
                                              <SelectLabel>More Models</SelectLabel>
                                            )}
                                            {additionalModelOptions.map(renderModelOption)}
                                          </SelectGroup>
                                        )}
                                        {recommendedModelOptions.length === 0 && additionalModelOptions.length === 0 && (
                                          <SelectGroup>
                                            {modelsForCurrentProvider.map(renderModelOption)}
                                          </SelectGroup>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  )
                                })()}
                              </div>
                            </>
                          )}

                          <div>
                            <div className="flex items-center justify-between">
                              <label className="block text-sm font-medium">
                                Temperature: {currentSettings.temperature.toFixed(2)}
                              </label>
                              {baselineSettings.temperature !== currentSettings.temperature && (
                                <span className="text-xs text-muted-foreground">Default {baselineSettings.temperature.toFixed(2)}</span>
                              )}
                            </div>
                            <Slider
                              value={[currentSettings.temperature]}
                              onValueChange={([value]) =>
                                updateSubAgentSettings(subAgent.id, prev => ({
                                  ...prev,
                                  temperature: value
                                }))
                              }
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

                          <div>
                            <div className="flex items-center justify-between">
                              <label className="block text-sm font-medium">Max Tokens</label>
                              {baselineSettings.maxTokens !== currentSettings.maxTokens && (
                                <span className="text-xs text-muted-foreground">Default {baselineSettings.maxTokens}</span>
                              )}
                            </div>
                            <Input
                              type="number"
                              value={currentSettings.maxTokens}
                              min={256}
                              step={256}
                              onChange={(e) => {
                                const value = Number.parseInt(e.target.value, 10)
                                updateSubAgentSettings(subAgent.id, prev => ({
                                  ...prev,
                                  maxTokens: Number.isNaN(value) ? prev.maxTokens : value
                                }))
                              }}
                            />
                          </div>

                          <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                            <div>
                              Defaults: {baselineSettings.model} • Temp {baselineSettings.temperature.toFixed(2)} • {baselineSettings.maxTokens} tokens
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      }
      case 'streaming':
        return (
          <div className="space-y-6">
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="enableStreaming"
                  checked={streamingEnabled}
                  onChange={(e) => setSettings(prev => ({ ...prev, streaming: e.target.checked }))}
                  className="mt-1 rounded"
                />
                <div>
                  <label htmlFor="enableStreaming" className="text-sm font-medium">
                    Enable live progress updates
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Streams intermediate progress from the orchestrator so you can monitor long-running tasks.
                  </p>
                </div>
              </div>

              {streamingEnabled && !streamingSupported && currentModel && (
                <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {currentModel.name} does not advertise streaming support. You may see delayed updates or fall back to batch responses.
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Streaming can slightly increase token consumption but surfaces results sooner. Disable it if you prefer consolidated outputs only.
            </div>
          </div>
        )

      case 'context':
        return (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Context Token Limit: {contextSettings.tokenLimitPercentage}%
              </label>
              <Slider
                value={[contextSettings.tokenLimitPercentage]}
                onValueChange={([value]) => {
                  updateContextSettings({ tokenLimitPercentage: value })
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
                Percentage of the selected model&apos;s context window reserved for contextual documents.
              </p>
              {currentModel && contextLimitTokens !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  Equivalent to {formatContextWindow(contextLimitTokens)} tokens out of {formatContextWindow(currentModel.contextLength)} available for {currentModel.name}.
                </p>
              )}
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="autoIncludePRD"
                checked={contextSettings.autoIncludeCurrentPRD}
                onChange={(e) => updateContextSettings({
                  autoIncludeCurrentPRD: e.target.checked
                })}
                className="mt-1 rounded"
              />
              <div>
                <label htmlFor="autoIncludePRD" className="text-sm font-medium">
                  Auto-include current PRD in context
                </label>
                <p className="text-xs text-muted-foreground">
                  When enabled, the latest PRD draft is injected automatically so agents can ground their responses.
                </p>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  })()


  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" size="wide" className={`${UI_DIMENSIONS.SETTINGS_PANEL_WIDTH} p-0 overflow-hidden`}>
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b p-4">
            <div className="flex items-center gap-2">
              <Settings className={ICON_SIZES.MEDIUM} />
              <SheetTitle>Settings</SheetTitle>
            </div>
          </SheetHeader>

          <div className="flex flex-1 overflow-hidden">
            <nav className="hidden w-60 shrink-0 flex-col gap-1 border-r bg-muted/40 p-4 md:flex">
              {SETTINGS_GROUPS.map(group => {
                const isActive = group.id === activeGroup
                const baseClasses =
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors'
                const activeClasses = 'bg-primary/10 text-primary'
                const inactiveClasses = 'text-muted-foreground hover:bg-muted'
                let indicator: JSX.Element | null = null

                if (group.id === 'openrouter' && modelsError) {
                  indicator = <span className="text-xs font-semibold text-red-500">!</span>
                } else if (group.id === 'model' && subAgentOverrideCount > 0) {
                  indicator = (
                    <span className="text-xs font-semibold text-blue-600">
                      {subAgentOverrideCount}
                    </span>
                  )
                } else if (group.id === 'streaming' && streamingEnabled && !streamingSupported) {
                  indicator = <span className="text-xs font-semibold text-amber-600">!</span>
                }

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setActiveGroup(group.id)}
                    className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
                  >
                    <span>{group.label}</span>
                    {indicator}
                  </button>
                )
              })}
            </nav>

            <div className="flex flex-1 flex-col">
              <div className="border-b p-3 md:hidden">
                <Select
                  value={activeGroup}
                  onValueChange={(value: string) => {
                    if (isSettingsGroupId(value)) {
                      setActiveGroup(value)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select settings group" />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTINGS_GROUPS.map(group => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 overflow-auto">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
                  <div>
                    <h2 className="text-lg font-semibold">{activeGroupMeta.label}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {activeGroupMeta.description}
                    </p>
                  </div>

                  {groupContent}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
