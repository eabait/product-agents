/**
 * Problem Statement Worker Prompts
 * 
 * Prompts for creating clear, concise problem statements
 * that define what problem the product solves.
 */

export function createProblemStatementPrompt(
  message: string,
  contextAnalysis: any,
  requirements: any
): string {
  return `Create a clear, concise problem statement for this product:
               Original request: ${message}
               Context: ${JSON.stringify(contextAnalysis)}
               Requirements: ${JSON.stringify(requirements)}
               
               The problem statement should be 2-3 sentences that clearly define what problem this product solves.`
}