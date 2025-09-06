import { ConfidenceAssessment, ConfidenceLevel } from '../schemas'

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
        overallScore += 3
        reasons.push('Input provides comprehensive information')
        break
      case 'medium':
        overallScore += 2
        reasons.push('Input provides adequate information')
        break
      case 'low':
        overallScore += 1
        reasons.push('Input provides limited information')
        break
    }
  }

  // Context Richness Assessment  
  if (factors.contextRichness) {
    totalFactors++
    switch (factors.contextRichness) {
      case 'high':
        overallScore += 3
        reasons.push('Rich contextual information available')
        break
      case 'medium':
        overallScore += 2
        reasons.push('Some contextual information available')
        break
      case 'low':
        overallScore += 1
        reasons.push('Limited contextual information')
        break
    }
  }

  // Validation Success
  if (factors.validationSuccess !== undefined) {
    totalFactors++
    if (factors.validationSuccess) {
      overallScore += 3
      reasons.push('Content passes validation checks')
    } else {
      overallScore += 1
      reasons.push('Content has validation issues')
    }
  }

  // Content Specificity
  if (factors.contentSpecificity) {
    totalFactors++
    switch (factors.contentSpecificity) {
      case 'high':
        overallScore += 3
        reasons.push('Generated content is highly specific and detailed')
        break
      case 'medium':
        overallScore += 2
        reasons.push('Generated content has moderate specificity')
        break
      case 'low':
        overallScore += 1
        reasons.push('Generated content lacks specificity')
        break
    }
  }

  // Error Presence
  if (factors.hasErrors !== undefined) {
    totalFactors++
    if (!factors.hasErrors) {
      overallScore += 3
      reasons.push('No processing errors occurred')
    } else {
      overallScore += 1
      reasons.push('Errors occurred during processing')
    }
  }

  // Content Length (quality indicator)
  if (factors.contentLength !== undefined) {
    totalFactors++
    if (factors.contentLength > 200) {
      overallScore += 3
      reasons.push('Generated substantial content')
    } else if (factors.contentLength > 50) {
      overallScore += 2
      reasons.push('Generated adequate content')
    } else {
      overallScore += 1
      reasons.push('Generated minimal content')
    }
  }

  // Calculate average score if we have factors
  const averageScore = totalFactors > 0 ? overallScore / totalFactors : 2

  // Determine confidence level based on average score
  let level: ConfidenceLevel
  if (averageScore >= 2.7) {
    level = 'high'
  } else if (averageScore >= 2.0) {
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
  if (messageLength > 100 && hasContextData) {
    return 'high'
  }
  
  // Either detailed input or good context
  if (messageLength > 50 || hasContextData) {
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
  
  const totalContext = contextItems + selectedMessages + (hasCurrentPRD ? 2 : 0)
  
  if (totalContext >= 5) return 'high'
  if (totalContext >= 2) return 'medium'
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
  if (contentStr.length > 500) specificityScore++
  if (contentStr.length < 100) specificityScore--
  
  if (specificityScore >= 2) return 'high'
  if (specificityScore >= 0) return 'medium'
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
      ...allReasons.slice(0, 5) // Limit to first 5 reasons
    ]
  }
}