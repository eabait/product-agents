// Utility for displaying categorical confidence assessments

export interface ConfidenceAssessment {
  level: 'high' | 'medium' | 'low'
  reasons: string[]
  factors?: {
    inputCompleteness?: 'high' | 'medium' | 'low'
    contextRichness?: 'high' | 'medium' | 'low'
    validationSuccess?: boolean
    contentSpecificity?: 'high' | 'medium' | 'low'
  }
}

// Type for handling both old numeric and new categorical confidence
export type ConfidenceValue = number | ConfidenceAssessment

/**
 * Formats confidence for display, handling both old numeric and new categorical formats
 */
export function formatConfidence(confidence: ConfidenceValue | undefined): {
  level: 'high' | 'medium' | 'low'
  displayText: string
  color: string
  reasons?: string[]
} {
  if (confidence === undefined) {
    return {
      level: 'medium',
      displayText: 'Medium Confidence',
      color: 'text-yellow-600',
      reasons: ['No confidence assessment available']
    }
  }

  // Handle old numeric format (0-1 scale)
  if (typeof confidence === 'number') {
    if (confidence >= 0.8) {
      return {
        level: 'high',
        displayText: 'High Confidence',
        color: 'text-green-600'
      }
    } else if (confidence >= 0.6) {
      return {
        level: 'medium',
        displayText: 'Medium Confidence',
        color: 'text-yellow-600'
      }
    } else {
      return {
        level: 'low',
        displayText: 'Low Confidence',
        color: 'text-red-600'
      }
    }
  }

  // Handle new categorical format
  const assessment = confidence as ConfidenceAssessment
  const levelColors = {
    high: 'text-green-600',
    medium: 'text-yellow-600',
    low: 'text-red-600'
  }

  const levelTexts = {
    high: 'High Confidence',
    medium: 'Medium Confidence',
    low: 'Low Confidence'
  }

  return {
    level: assessment.level,
    displayText: levelTexts[assessment.level],
    color: levelColors[assessment.level],
    reasons: assessment.reasons
  }
}

/**
 * Gets a compact badge text for confidence level
 */
export function getConfidenceBadgeText(confidence: ConfidenceValue | undefined): string {
  const formatted = formatConfidence(confidence)
  return formatted.level.charAt(0).toUpperCase() + formatted.level.slice(1)
}

/**
 * Gets appropriate badge styling classes for confidence level
 */
export function getConfidenceBadgeClasses(confidence: ConfidenceValue | undefined): string {
  const formatted = formatConfidence(confidence)
  
  const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
  
  switch (formatted.level) {
    case 'high':
      return `${baseClasses} bg-green-100 text-green-800`
    case 'medium':
      return `${baseClasses} bg-yellow-100 text-yellow-800`
    case 'low':
      return `${baseClasses} bg-red-100 text-red-800`
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`
  }
}

/**
 * Combines multiple section confidence assessments into an overall assessment description
 */
export function formatOverallConfidence(
  confidenceAssessments: Record<string, ConfidenceValue> | undefined,
  overallConfidence?: ConfidenceValue
): {
  level: 'high' | 'medium' | 'low'
  displayText: string
  summary: string
  color: string
} {
  // If we have an explicit overall assessment, use it
  if (overallConfidence) {
    const formatted = formatConfidence(overallConfidence)
    return {
      level: formatted.level,
      displayText: formatted.displayText,
      summary: formatted.reasons?.[0] || 'Overall quality assessment',
      color: formatted.color
    }
  }

  // Fall back to analyzing individual section assessments
  if (!confidenceAssessments || Object.keys(confidenceAssessments).length === 0) {
    return {
      level: 'medium',
      displayText: 'Medium Confidence',
      summary: 'No detailed assessment available',
      color: 'text-yellow-600'
    }
  }

  const sections = Object.entries(confidenceAssessments)
  const levelCounts = { high: 0, medium: 0, low: 0 }
  
  sections.forEach(([_, confidence]) => {
    const formatted = formatConfidence(confidence)
    levelCounts[formatted.level]++
  })

  const totalSections = sections.length
  let overallLevel: 'high' | 'medium' | 'low'
  let summary: string

  if (levelCounts.high >= totalSections / 2) {
    overallLevel = 'high'
    summary = `Strong confidence across ${levelCounts.high}/${totalSections} sections`
  } else if (levelCounts.low >= totalSections / 2) {
    overallLevel = 'low'
    summary = `Lower confidence in ${levelCounts.low}/${totalSections} sections`
  } else {
    overallLevel = 'medium'
    summary = `Mixed confidence across ${totalSections} sections`
  }

  return {
    level: overallLevel,
    displayText: overallLevel.charAt(0).toUpperCase() + overallLevel.slice(1) + ' Confidence',
    summary,
    color: overallLevel === 'high' ? 'text-green-600' : 
           overallLevel === 'medium' ? 'text-yellow-600' : 'text-red-600'
  }
}