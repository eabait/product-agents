import { ConfidenceAssessment, ConfidenceLevel } from '../schemas'

// Confidence threshold constants
export const CONFIDENCE_THRESHOLDS = {
  LOW_AI_CONFIDENCE_WARNING: 70,
  MIN_ACCEPTABLE_CONFIDENCE: 50,
  HIGH_CONFIDENCE_THRESHOLD: 85
} as const

// Content validation constants
export const CONTENT_VALIDATION = {
  MIN_CONTENT_LENGTH: 10,
  MAX_MISSING_ITEMS_FOR_MEDIUM: 2,
  MAX_MISSING_ITEMS_FOR_HIGH: 0
} as const

// Confidence scoring constants
export const CONFIDENCE_SCORING = {
  HIGH_FACTOR_SCORE: 3,
  MEDIUM_FACTOR_SCORE: 2,
  LOW_FACTOR_SCORE: 1,
  DEFAULT_SCORE: 2,
  HIGH_THRESHOLD: 2.7,
  MEDIUM_THRESHOLD: 2.0
} as const

// Content assessment thresholds
export const CONTENT_THRESHOLDS = {
  DETAILED_INPUT_LENGTH: 100,
  ADEQUATE_INPUT_LENGTH: 50,
  SUBSTANTIAL_CONTENT_LENGTH: 200,
  ADEQUATE_CONTENT_LENGTH: 50,
  RICH_CONTEXT_ITEMS: 5,
  ADEQUATE_CONTEXT_ITEMS: 2,
  PRD_CONTEXT_WEIGHT: 2,
  LONG_CONTENT_LENGTH: 500,
  SHORT_CONTENT_LENGTH: 100,
  HIGH_SPECIFICITY_SCORE: 2,
  MEDIUM_SPECIFICITY_SCORE: 0,
  MAX_COMBINED_REASONS: 5
} as const

interface ConfidenceFactors {
  inputCompleteness?: 'high' | 'medium' | 'low'
  contextRichness?: 'high' | 'medium' | 'low'
  validationSuccess?: boolean
  contentSpecificity?: 'high' | 'medium' | 'low'
  hasErrors?: boolean
  contentLength?: number
}

/**
 * Assesses confidence level based on concrete factors rather than hardcoded values
 */
export function assessConfidence(factors: ConfidenceFactors): ConfidenceAssessment {
  const reasons: string[] = []
  let overallScore = 0
  let totalFactors = 0

  // Input Completeness Assessment
  if (factors.inputCompleteness) {
    totalFactors++
    switch (factors.inputCompleteness) {
      case 'high':
        overallScore += CONFIDENCE_SCORING.HIGH_FACTOR_SCORE
        reasons.push('Input provides comprehensive information')
        break
      case 'medium':
        overallScore += CONFIDENCE_SCORING.MEDIUM_FACTOR_SCORE
        reasons.push('Input provides adequate information')
        break
      case 'low':
        overallScore += CONFIDENCE_SCORING.LOW_FACTOR_SCORE
        reasons.push('Input provides limited information')
        break
    }
  }

  // Context Richness Assessment  
  if (factors.contextRichness) {
    totalFactors++
    switch (factors.contextRichness) {
      case 'high':
        overallScore += CONFIDENCE_SCORING.HIGH_FACTOR_SCORE
        reasons.push('Rich contextual information available')
        break
      case 'medium':
        overallScore += CONFIDENCE_SCORING.MEDIUM_FACTOR_SCORE
        reasons.push('Some contextual information available')
        break
      case 'low':
        overallScore += CONFIDENCE_SCORING.LOW_FACTOR_SCORE
        reasons.push('Limited contextual information')
        break
    }
  }

  // Validation Success
  if (factors.validationSuccess !== undefined) {
    totalFactors++
    if (factors.validationSuccess) {
      overallScore += CONFIDENCE_SCORING.HIGH_FACTOR_SCORE
      reasons.push('Content passes validation checks')
    } else {
      overallScore += CONFIDENCE_SCORING.LOW_FACTOR_SCORE
      reasons.push('Content has validation issues')
    }
  }

  // Content Specificity
  if (factors.contentSpecificity) {
    totalFactors++
    switch (factors.contentSpecificity) {
      case 'high':
        overallScore += CONFIDENCE_SCORING.HIGH_FACTOR_SCORE
        reasons.push('Generated content is highly specific and detailed')
        break
      case 'medium':
        overallScore += CONFIDENCE_SCORING.MEDIUM_FACTOR_SCORE
        reasons.push('Generated content has moderate specificity')
        break
      case 'low':
        overallScore += CONFIDENCE_SCORING.LOW_FACTOR_SCORE
        reasons.push('Generated content lacks specificity')
        break
    }
  }

  // Error Presence
  if (factors.hasErrors !== undefined) {
    totalFactors++
    if (!factors.hasErrors) {
      overallScore += CONFIDENCE_SCORING.HIGH_FACTOR_SCORE
      reasons.push('No processing errors occurred')
    } else {
      overallScore += CONFIDENCE_SCORING.LOW_FACTOR_SCORE
      reasons.push('Errors occurred during processing')
    }
  }

  // Content Length (quality indicator)
  if (factors.contentLength !== undefined) {
    totalFactors++
    if (factors.contentLength > CONTENT_THRESHOLDS.SUBSTANTIAL_CONTENT_LENGTH) {
      overallScore += CONFIDENCE_SCORING.HIGH_FACTOR_SCORE
      reasons.push('Generated substantial content')
    } else if (factors.contentLength > CONTENT_THRESHOLDS.ADEQUATE_CONTENT_LENGTH) {
      overallScore += CONFIDENCE_SCORING.MEDIUM_FACTOR_SCORE
      reasons.push('Generated adequate content')
    } else {
      overallScore += CONFIDENCE_SCORING.LOW_FACTOR_SCORE
      reasons.push('Generated minimal content')
    }
  }

  // Calculate average score if we have factors
  const averageScore = totalFactors > 0 ? overallScore / totalFactors : CONFIDENCE_SCORING.DEFAULT_SCORE

  // Determine confidence level based on average score
  let level: ConfidenceLevel
  if (averageScore >= CONFIDENCE_SCORING.HIGH_THRESHOLD) {
    level = 'high'
  } else if (averageScore >= CONFIDENCE_SCORING.MEDIUM_THRESHOLD) {
    level = 'medium'
  } else {
    level = 'low'
  }

  // Add no factors fallback
  if (totalFactors === 0) {
    level = 'medium'
    reasons.push('Using default confidence level - insufficient assessment data')
  }

  return {
    level,
    reasons,
    factors: {
      inputCompleteness: factors.inputCompleteness,
      contextRichness: factors.contextRichness,
      validationSuccess: factors.validationSuccess,
      contentSpecificity: factors.contentSpecificity
    }
  }
}

/**
 * Assesses input completeness based on message characteristics
 */
export function assessInputCompleteness(message: string, contextPayload?: any): ConfidenceLevel {
  const messageLength = message.trim().length
  const hasContextData = contextPayload && (
    contextPayload.categorizedContext?.length > 0 ||
    contextPayload.selectedMessages?.length > 0
  )
  
  // Detailed input with context
  if (messageLength > CONTENT_THRESHOLDS.DETAILED_INPUT_LENGTH && hasContextData) {
    return 'high'
  }
  
  // Either detailed input or good context
  if (messageLength > CONTENT_THRESHOLDS.ADEQUATE_INPUT_LENGTH || hasContextData) {
    return 'medium'
  }
  
  return 'low'
}

/**
 * Assesses context richness from available data
 */
export function assessContextRichness(contextPayload?: any): ConfidenceLevel {
  if (!contextPayload) return 'low'
  
  const contextItems = contextPayload.categorizedContext?.length || 0
  const selectedMessages = contextPayload.selectedMessages?.length || 0
  const hasCurrentPRD = !!contextPayload.currentPRD
  
  const totalContext = contextItems + selectedMessages + (hasCurrentPRD ? CONTENT_THRESHOLDS.PRD_CONTEXT_WEIGHT : 0)
  
  if (totalContext >= CONTENT_THRESHOLDS.RICH_CONTEXT_ITEMS) return 'high'
  if (totalContext >= CONTENT_THRESHOLDS.ADEQUATE_CONTEXT_ITEMS) return 'medium'
  return 'low'
}

/**
 * Assesses content specificity based on generated content
 */
export function assessContentSpecificity(content: any): ConfidenceLevel {
  if (!content) return 'low'
  
  let specificityScore = 0
  
  // Check if content has specific details vs generic statements
  const contentStr = JSON.stringify(content).toLowerCase()
  
  // Positive indicators of specificity
  const specificTerms = ['specific', 'example', 'particular', 'detailed', 'precise', 'exactly']
  const hasSpecificTerms = specificTerms.some(term => contentStr.includes(term))
  if (hasSpecificTerms) specificityScore++
  
  // Numbers and measurements indicate specificity
  const hasNumbers = /\d+/.test(contentStr)
  if (hasNumbers) specificityScore++
  
  // Proper nouns indicate specific context
  const hasProperNouns = /[A-Z][a-z]+/.test(JSON.stringify(content))
  if (hasProperNouns) specificityScore++
  
  // Check for vague language (negative indicator)
  const vagueTerms = ['general', 'basic', 'simple', 'various', 'multiple', 'different']
  const hasVagueTerms = vagueTerms.some(term => contentStr.includes(term))
  if (hasVagueTerms) specificityScore--
  
  // Content length as specificity indicator
  if (contentStr.length > CONTENT_THRESHOLDS.LONG_CONTENT_LENGTH) specificityScore++
  if (contentStr.length < CONTENT_THRESHOLDS.SHORT_CONTENT_LENGTH) specificityScore--
  
  if (specificityScore >= CONTENT_THRESHOLDS.HIGH_SPECIFICITY_SCORE) return 'high'
  if (specificityScore >= CONTENT_THRESHOLDS.MEDIUM_SPECIFICITY_SCORE) return 'medium'
  return 'low'
}

/**
 * Combines multiple section confidence assessments into an overall assessment
 */
export function combineConfidenceAssessments(
  assessments: Record<string, ConfidenceAssessment>
): ConfidenceAssessment {
  const sectionNames = Object.keys(assessments)
  const levels = sectionNames.map(name => assessments[name].level)
  
  // Count confidence levels
  const levelCounts = { high: 0, medium: 0, low: 0 }
  levels.forEach(level => levelCounts[level]++)
  
  // Determine overall level
  let overallLevel: ConfidenceLevel
  if (levelCounts.high >= sectionNames.length / 2) {
    overallLevel = 'high'
  } else if (levelCounts.low >= sectionNames.length / 2) {
    overallLevel = 'low'
  } else {
    overallLevel = 'medium'
  }
  
  // Combine reasons
  const allReasons = sectionNames.flatMap(name => 
    assessments[name].reasons.map(reason => `${name}: ${reason}`)
  )
  
  return {
    level: overallLevel,
    reasons: [
      `Overall assessment based on ${sectionNames.length} sections`,
      `${levelCounts.high} high confidence, ${levelCounts.medium} medium confidence, ${levelCounts.low} low confidence`,
      ...allReasons.slice(0, CONTENT_THRESHOLDS.MAX_COMBINED_REASONS) // Limit to first few reasons
    ]
  }
}