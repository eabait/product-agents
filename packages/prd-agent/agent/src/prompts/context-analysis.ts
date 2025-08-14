/**
 * Context Analysis Worker Prompts
 * 
 * Prompts for analyzing product requests and extracting key themes,
 * requirements, and constraints.
 */

export function createContextAnalysisPrompt(message: string): string {
  return `Analyze this product request and extract key themes, requirements, and constraints: ${message}`
}