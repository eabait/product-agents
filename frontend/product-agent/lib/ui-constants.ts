/**
 * UI Constants and Enums for PRD Agent Frontend
 * 
 * This file contains all magic numbers extracted from components,
 * organized using TypeScript enums and const assertions for better
 * type safety and maintainability.
 */

// ============================================================================
// UI Layout Dimensions
// ============================================================================

export const UI_DIMENSIONS = {
  // Panel widths (Tailwind classes)
  CONTEXT_PANEL_WIDTH: 'w-96',
  SETTINGS_PANEL_WIDTH: 'w-full sm:w-[90vw] xl:w-[1120px] max-w-[1120px]',
  SIDEBAR_COLLAPSED_WIDTH: 'w-16',
  SIDEBAR_EXPANDED_WIDTH: 'w-80',
  
  // Component heights
  HEADER_HEIGHT: 'h-14',
  TEXTAREA_MAX_HEIGHT: 160,
  LOADING_INDICATOR_SIZE: 'w-3 h-3',
} as const

export const ICON_SIZES = {
  TINY: 'h-3 w-3',
  SMALL: 'h-4 w-4',
  MEDIUM: 'h-5 w-5',
  LARGE: 'h-6 w-6',
  EMPTY_STATE: 'h-8 w-8',
} as const

// ============================================================================
// Performance and Caching
// ============================================================================

export enum CacheSettings {
  TTL_MS = 30000,              // 30 seconds cache TTL
  MAX_SIZE = 1000,             // Maximum cache entries
  TOKEN_CACHE_MAX_SIZE = 1000, // Token estimation cache limit
}

export enum RetrySettings {
  MAX_ATTEMPTS = 3,            // Maximum retry attempts for storage operations
  DEBOUNCE_DELAY_MS = 500,     // Debounce delay for frequent operations
}

export enum TimingSettings {
  COPY_FEEDBACK_TIMEOUT = 2000, // Time to show copy confirmation
  SETTINGS_FETCH_DELAY = 100,   // Delay before fetching agent defaults
  MODEL_FETCH_DELAY = 200,      // Delay before fetching models
  SAVE_TITLE_BLUR_DELAY = 100,  // Delay on input blur before saving title
}

// ============================================================================
// Usage and Performance Thresholds
// ============================================================================

export enum UsageThreshold {
  WARNING = 70,                // Yellow warning threshold (%)
  CRITICAL = 90,               // Red critical threshold (%)
  MAXIMUM = 100,               // Maximum percentage value
  APPROACHING = 80,            // Approaching limit threshold for validation
}

export enum ConfidenceThreshold {
  MINIMUM = 15,                // Minimum confidence for category suggestions
  MEDIUM = 50,                 // Medium confidence threshold
  HIGH = 80,                   // High confidence threshold for warnings
  MISMATCH_DETECTION = 50,     // Threshold for detecting category mismatches
}

export enum TokenSizeLimits {
  WARNING = 1000,              // Token count warning threshold
  ERROR = 2000,                // Token count error threshold
}

// ============================================================================
// Text and Content Validation
// ============================================================================

export const VALIDATION_LIMITS = {
  // Title handling
  TITLE_CHAR_LIMIT: 50,        // Smart title generation limit
  TITLE_TRUNCATE_POINT: 47,    // Characters before adding "..."
  MAX_TITLE_LENGTH: 100,       // Maximum allowed title length
  
  // Array indices and counts
  FIRST_ITEM_INDEX: 0,         // First array item
  SINGULAR_ITEM_COUNT: 1,      // Count for singular/plural logic
  
  // Context window formatting
  CONTEXT_WINDOW_DIVISOR: 1000, // Convert tokens to K format
} as const

// ============================================================================
// Model and API Configuration
// ============================================================================

/**
 * Provider-based token estimation ratios (characters per token)
 * More maintainable than model-specific ratios and scales with new models
 */
export const PROVIDER_TOKEN_RATIOS = {
  // Major providers with known tokenization characteristics
  'anthropic': 3.8,    // Claude models - generally more efficient tokenization
  'openai': 3.7,       // GPT models - standard tokenization
  'google': 4.2,       // Gemini models - slightly less efficient  
  'meta': 4.0,         // Llama models - average efficiency
  'mistral': 3.9,      // Mistral models - good efficiency
  'cohere': 4.1,       // Command models - average efficiency
  'perplexity': 3.8,   // pplx models - similar to Claude
  'qwen': 4.0,         // Qwen models - average efficiency
  'x-ai': 3.9,         // Grok models - good efficiency
  'default': 4.0       // Fallback for unknown providers
} as const

/**
 * Text type multipliers for more accurate token estimation
 */
export const TEXT_TYPE_MULTIPLIERS = {
  'natural': 1.0,      // Natural language (baseline)
  'code': 0.8,         // Code tends to tokenize more efficiently
  'json': 0.9,         // JSON is structured but has overhead
  'markdown': 1.1,     // Markdown has formatting overhead
} as const

/**
 * Legacy model token ratios (deprecated - use provider ratios instead)
 * Kept for backwards compatibility only
 */
export const LEGACY_MODEL_TOKEN_RATIOS = {
  'anthropic/claude-3-5-sonnet': 3.8,
  'anthropic/claude-3-haiku': 4.2,
  'openai/gpt-4': 3.5,
  'openai/gpt-3.5-turbo': 4.0,
} as const

export const CALCULATION_WEIGHTS = {
  EXACT_MATCH_MULTIPLIER: 2,    // Weight multiplier for exact keyword matches
  TITLE_MATCH_BONUS: 1.5,      // Additional weight for title matches
  PARTIAL_MATCH_WEIGHT: 0.5,   // Weight for partial keyword matches
  PARTIAL_WEIGHTED_SCORE: 0.3, // Weighted score for partial matches
  WORD_BOUNDARY_ADJUSTMENT: 0.1, // Token estimation word boundary adjustment
} as const

// ============================================================================
// Slider and Input Configurations
// ============================================================================

export const SLIDER_CONFIGS = {
  TEMPERATURE: {
    MIN: 0,
    MAX: 2,
    STEP: 0.1,
  },
  CONTEXT_TOKEN_LIMIT: {
    MIN: 10,
    MAX: 50,  
    STEP: 5,
  },
} as const

// ============================================================================
// Error Handling
// ============================================================================

export enum ErrorCodes {
  QUOTA_EXCEEDED = 22,          // DOMException quota exceeded error code
}

// ============================================================================
// Category Suggestion
// ============================================================================

export const CATEGORY_SUGGESTION_WEIGHTS = {
  CONFIDENCE_BASE_MULTIPLIER: 30,  // Base multiplier for confidence calculation
  TITLE_MATCH_CONFIDENCE_BONUS: 20, // Bonus for title keyword matches
  MAX_KEYWORD_REASONS: 3,          // Maximum keywords to show in reasons
} as const

// ============================================================================
// Type helpers for const assertions
// ============================================================================

export type UIDimension = typeof UI_DIMENSIONS[keyof typeof UI_DIMENSIONS]
export type IconSize = typeof ICON_SIZES[keyof typeof ICON_SIZES]
export type ValidationLimit = typeof VALIDATION_LIMITS[keyof typeof VALIDATION_LIMITS]
export type ProviderTokenRatio = typeof PROVIDER_TOKEN_RATIOS[keyof typeof PROVIDER_TOKEN_RATIOS]
export type TextTypeMultiplier = typeof TEXT_TYPE_MULTIPLIERS[keyof typeof TEXT_TYPE_MULTIPLIERS]
export type CalculationWeight = typeof CALCULATION_WEIGHTS[keyof typeof CALCULATION_WEIGHTS]
