/**
 * Requirements Extraction Worker Prompts
 * 
 * Prompts for extracting functional and non-functional requirements
 * from user requests and context analysis.
 */

export function createRequirementsExtractionPrompt(
  message: string, 
  contextAnalysis: any
): string {
  return `Extract functional and non-functional requirements from:
               Original request: ${message}
               Context analysis: ${JSON.stringify(contextAnalysis)}`
}