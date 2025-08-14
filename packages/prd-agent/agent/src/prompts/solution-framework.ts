/**
 * Solution Framework Worker Prompts
 * 
 * Prompts for designing minimal, PRD-friendly solution frameworks
 * with specific technical components and approaches.
 */

export function createSolutionFrameworkPrompt(problemStatement: string): string {
  return `Design a minimal, PRD-friendly solution framework for this problem:
               Problem: ${problemStatement}
               
               You are producing content for a Product Requirements Document — be concise and return only the JSON object requested (no explanation text).
               Return exactly this structure and keep values short (one line strings or short arrays):
               {
                 "approach": "One-sentence overview",
                 "components": ["UI", "API", "Database"],
                 "technologies": ["React", "Postgres"]
               }
               
               Prefer human-readable strings/arrays. If you must return objects, keep values short and suitable for insertion into a PRD.`
}