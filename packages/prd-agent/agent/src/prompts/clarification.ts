/**
 * Clarification Prompt
 * 
 * Analyzes user input to determine if sufficient context exists for PRD generation
 * and generates targeted questions to gather missing information.
 */

export function createClarificationPrompt(userMessage: string): string {
  return `Analyze this product request for PRD generation completeness: "${userMessage}"

EVALUATION CRITERIA:
A PRD can be generated if the request contains:
- MINIMUM VIABLE INFORMATION: Core product concept, general user type, basic functionality
- REASONABLE ASSUMPTIONS: You can infer common patterns for similar products

PROGRESSIVE QUESTIONING APPROACH:
1. CRITICAL (must ask): Missing core product concept, completely unclear users, or no functionality described
2. IMPORTANT (should ask): Missing business context, unclear technical constraints, or vague success criteria
3. OPTIONAL (skip): Specific metrics, detailed technical specs, or minor feature details

DECISION GUIDELINES:
- PROCEED if you can build a meaningful PRD with reasonable assumptions
- ASK CRITICAL questions only for fundamental gaps that would result in a generic or meaningless PRD
- SKIP questions about details that can be addressed in later iterations or are standard for the product type
- PREFER making reasonable inferences over asking obvious questions

CONFIDENCE EVALUATION:
Rate your confidence (0-100) that you can generate a valuable PRD:
- 80-100: Definitely proceed (needsClarification: false)
- 60-79: Likely proceed but consider 1-2 critical questions
- 40-59: Ask 2-3 targeted questions focusing on core gaps
- 0-39: Request clarification on fundamental aspects

Examples of REASONABLE ASSUMPTIONS to make instead of asking:
- Mobile apps usually target 18-45 age range unless specified otherwise
- E-commerce platforms need payment processing, user accounts, product catalogs
- Task management tools typically need creation, assignment, status tracking
- Social platforms require user profiles, content sharing, basic discovery

Return format:
{
  "needsClarification": boolean,
  "confidence": number,
  "missingCritical": ["list of critical gaps"],
  "questions": ["only critical questions", ...]
}`
}