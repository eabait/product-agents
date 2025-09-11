/**
 * Section Detection Prompt
 * 
 * Analyzes PRD edit requests to determine which sections need updates
 */

export function createSectionDetectionPrompt(
  message: string, 
  existingPRD?: any
): string {
  const sections = [
    'targetUsers - Who the product is for',
    'solution - What we\'re building and how',  
    'keyFeatures - Core features and functionality',
    'successMetrics - How we measure success',
    'constraints - Technical and business limitations/assumptions'
  ]

  const existingContext = existingPRD ? `
EXISTING PRD CONTEXT:
- Target Users: ${JSON.stringify(existingPRD.sections?.targetUsers?.targetUsers || existingPRD.targetUsers || [], null, 2)}
- Solution: ${existingPRD.sections?.solution?.solutionOverview || existingPRD.solutionOverview || 'Not defined'}
- Key Features: ${JSON.stringify(existingPRD.sections?.keyFeatures?.keyFeatures || existingPRD.goals || [], null, 2)}
- Success Metrics: ${JSON.stringify(existingPRD.sections?.successMetrics?.successMetrics || existingPRD.successMetrics || [], null, 2)}
- Constraints: ${JSON.stringify(existingPRD.sections?.constraints?.constraints || existingPRD.constraints || [], null, 2)}
` : ''

  return `You are analyzing a PRD edit request to determine which sections need to be updated.

AVAILABLE SECTIONS:
${sections.map(s => `- ${s}`).join('\n')}

USER REQUEST: "${message}"

${existingContext}

INSTRUCTIONS:
1. Analyze the user's request carefully to understand the scope and intent
2. Determine which sections would be directly affected by this change
3. Be CONSERVATIVE - only include sections that truly need updates
4. Consider the difference between:
   - Adding/modifying features → keyFeatures
   - Changing who uses the product → targetUsers  
   - Changing the core approach → solution
   - Adding success measurements → successMetrics
   - Adding technical/business constraints → constraints

EXAMPLES:
- "add telegram integration" → keyFeatures only
- "target small businesses instead" → targetUsers, solution (maybe successMetrics)
- "must support GDPR" → constraints only
- "measure user engagement" → successMetrics only
- "change from web to mobile app" → solution, keyFeatures, constraints

Return your analysis as JSON with:
- affectedSections: array of section names that need updates
- reasoning: brief explanation for each section
- confidence: how certain you are (high/medium/low)

Be very careful not to over-update sections. If unsure whether a section needs updating, exclude it.`
}