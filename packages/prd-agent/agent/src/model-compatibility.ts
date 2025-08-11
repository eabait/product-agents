// Tool-compatible models whitelist for OpenRouter
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

export function isModelToolCompatible(modelId: string): boolean {
  // Check exact matches first
  if (TOOL_COMPATIBLE_MODELS.includes(modelId as any)) {
    return true;
  }
  
  // Check pattern matches
  return TOOL_COMPATIBLE_PATTERNS.some(pattern => pattern.test(modelId));
}