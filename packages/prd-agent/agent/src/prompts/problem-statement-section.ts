/**
 * Problem Statement Section Writer Prompt
 * 
 * Generates comprehensive Problem Statement section for PRDs
 */

import type { SectionWriterInput } from '../section-writers'

export function createProblemStatementSectionPrompt(
  input: SectionWriterInput,
  contextAnalysis: any,
  contentSummary: any
): string {
  return `Generate a comprehensive Problem Statement section for a PRD based on the following analysis:

User Input: "${input.message}"

Context Analysis:
- Themes: ${contextAnalysis?.themes?.join(', ') || 'None'}
- Functional Requirements: ${contextAnalysis?.requirements?.functional?.join(', ') || 'None'}
- Technical Requirements: ${contextAnalysis?.requirements?.technical?.join(', ') || 'None'}
- Constraints: ${contextAnalysis?.constraints?.join(', ') || 'None'}

Content Summary:
- Executive Summary: ${contentSummary?.executive_summary || 'None available'}
- Key Points: ${contentSummary?.key_points?.join(', ') || 'None'}
- Priorities: ${contentSummary?.priorities?.map((p: any) => `${p.item} (${p.priority})`).join(', ') || 'None'}

${input.context?.contextPayload ? `Additional Context: ${JSON.stringify(input.context.contextPayload)}` : ''}

Generate a problem statement section with:

1. **Problem Statement**: 
   - Clear, concise statement of the core problem (1-2 sentences)
   - Should be specific and actionable
   - Avoid solution language, focus on the problem

2. **Problem Context**:
   - Background information that explains why this problem exists
   - Current state vs. desired state
   - Broader context of the business/technical environment

3. **Impact Statement**:
   - Quantify the impact of NOT solving this problem
   - Business, user, and technical impacts
   - Cost of inaction or current workarounds

4. **Target Users**:
   - Specific user personas affected by this problem
   - Their pain points related to this problem
   - Current solutions they use (and why they're inadequate)
   - Unmet needs that a solution should address

5. **Root Causes**:
   - Underlying causes of the problem (not symptoms)
   - Evidence supporting each root cause
   - Impact level of each cause

6. **Success Criteria**:
   - How will we know the problem is solved?
   - Measurable outcomes that indicate success
   - Should be specific and time-bound where possible

The problem statement should be:
- User-focused and evidence-based
- Clear enough for any stakeholder to understand
- Specific to avoid scope creep
- Connected to business value and user impact

Generate realistic, well-researched content based on the analysis provided.`
}