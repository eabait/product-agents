// Model capability types
export type ModelCapability = 'reasoning' | 'structured_output' | 'tools' | 'multimodal'

// Model capability definitions and compatibility mappings
export const MODEL_CAPABILITIES: Record<ModelCapability, string[]> = {
  // Models with advanced reasoning capabilities
  reasoning: [
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-opus',
    'anthropic/claude-3-sonnet',
    'openai/gpt-4o',
    'openai/gpt-4-turbo',
    'openai/gpt-4',
    'google/gemini-pro',
    'google/gemini-pro-1.5',
    'mistralai/mistral-large'
  ],
  
  // Models with structured output capabilities (JSON, schema-based generation)
  structured_output: [
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-5-haiku',
    'anthropic/claude-3-opus',
    'anthropic/claude-3-sonnet',
    'anthropic/claude-3-haiku',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4-turbo',
    'openai/gpt-4',
    'openai/gpt-3.5-turbo',
    'google/gemini-pro',
    'google/gemini-pro-1.5',
    'mistralai/mistral-large',
    'cohere/command-r-plus'
  ],
  
  // Models with function calling/tool use capabilities
  tools: [
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-5-haiku', 
    'anthropic/claude-3-opus',
    'anthropic/claude-3-sonnet',
    'anthropic/claude-3-haiku',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-4-turbo',
    'openai/gpt-4',
    'openai/gpt-3.5-turbo',
    'google/gemini-pro',
    'google/gemini-pro-1.5',
    'mistralai/mistral-large',
    'cohere/command-r-plus'
  ],
  
  // Models with multimodal capabilities (vision, etc.)
  multimodal: [
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-opus',
    'anthropic/claude-3-sonnet',
    'openai/gpt-4o',
    'openai/gpt-4-turbo',
    'google/gemini-pro-1.5'
  ]
}

// Legacy: Tool-compatible models whitelist for OpenRouter
// These models support function calling/structured generation
export const TOOL_COMPATIBLE_MODELS = [
  // Anthropic models (all support tools)
  'anthropic/claude-3-5-sonnet',
  'anthropic/claude-3-5-haiku', 
  'anthropic/claude-3-opus',
  'anthropic/claude-3-sonnet',
  'anthropic/claude-3-haiku',
  
  // OpenAI models (selected ones that support tools)
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4-turbo',
  'openai/gpt-4',
  'openai/gpt-3.5-turbo',
  
  // Google models
  'google/gemini-pro',
  'google/gemini-pro-1.5',
  
  // Other providers with tool support
  'mistralai/mistral-large',
  'cohere/command-r-plus'
] as const;

export const TOOL_COMPATIBLE_PATTERNS = [
  /^anthropic\/claude-3/,
  /^openai\/gpt-4/,
  /^openai\/gpt-3\.5-turbo/,
  /^google\/gemini-pro/,
  /^mistralai\/mistral-large/,
  /^cohere\/command-r/
] as const;

// Check if a model supports a specific capability
export function hasModelCapability(modelId: string, capability: ModelCapability): boolean {
  const capabilityModels = MODEL_CAPABILITIES[capability]
  
  // Check exact matches first
  if (capabilityModels.includes(modelId)) {
    return true
  }
  
  // Check pattern matches for backward compatibility
  if (capability === 'tools') {
    return TOOL_COMPATIBLE_PATTERNS.some(pattern => pattern.test(modelId))
  }
  
  return false
}

// Check if a model supports all required capabilities
export function hasAllCapabilities(modelId: string, requiredCapabilities: ModelCapability[]): boolean {
  return requiredCapabilities.every(capability => hasModelCapability(modelId, capability))
}

// Get models that support all required capabilities
export function getCompatibleModels<T extends { id: string }>(
  models: T[], 
  requiredCapabilities: ModelCapability[]
): T[] {
  return models.filter(model => hasAllCapabilities(model.id, requiredCapabilities))
}

// Legacy function for backward compatibility
export function isModelToolCompatible(modelId: string): boolean {
  return hasModelCapability(modelId, 'tools')
}

export function getToolCompatibleModels(models: Array<{ id: string }>): Array<{ id: string }> {
  return models.filter(model => isModelToolCompatible(model.id));
}

export function mapOpenRouterToAgentCapabilities(model: any): ModelCapability[] {
  const mappedCapabilities: ModelCapability[] = []
  
  // Check for tools capability
  if (model.supported_parameters?.includes('tools') || model.supported_parameters?.includes('tool_choice')) {
    mappedCapabilities.push('tools' as ModelCapability)
  }
  
  // Check for structured output capability
  if (model.supported_parameters?.includes('structured_outputs') || 
      model.supported_parameters?.includes('response_format')) {
    mappedCapabilities.push('structured_output' as ModelCapability)
  }
  
  // Check for reasoning capability
  if (model.supported_parameters?.includes('reasoning') || 
      model.supported_parameters?.includes('include_reasoning')) {
    mappedCapabilities.push('reasoning' as ModelCapability)
  }
  
  // Check for multimodal capability (vision, image input)
  if (model.architecture?.input_modalities?.includes('image') || 
      model.architecture?.input_modalities?.includes('file')) {
    mappedCapabilities.push('multimodal' as ModelCapability)
  }
  
  // For models that support tools, check if they're from known families that support all capabilities
  if (mappedCapabilities.includes('tools')) {
    const fullCapabilityModels = [
      'anthropic/claude-3-5-sonnet', 'anthropic/claude-3-opus', 'anthropic/claude-3-sonnet', 'anthropic/claude-3-haiku',
      'openai/gpt-4o', 'openai/gpt-4-turbo', 'openai/gpt-4', 'openai/gpt-3.5-turbo',
      'google/gemini-pro', 'google/gemini-pro-1.5',
      'mistralai/mistral-large'
    ]
    
    const isFullCapability = fullCapabilityModels.some(known => model.id === known || model.id.startsWith(known))
    
    if (isFullCapability) {
      if (!mappedCapabilities.includes('structured_output' as ModelCapability)) {
        mappedCapabilities.push('structured_output' as ModelCapability)
      }
      if (!mappedCapabilities.includes('reasoning' as ModelCapability)) {
        mappedCapabilities.push('reasoning' as ModelCapability)
      }
    }
  }
  
  return mappedCapabilities
}