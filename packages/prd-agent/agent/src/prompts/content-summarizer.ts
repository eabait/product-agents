/**
 * Content Summarizer Prompt
 * 
 * Summarizes content with different focus areas and lengths
 */

export interface SummaryOptions {
  target_length: 'brief' | 'medium' | 'detailed'
  focus_area: 'technical' | 'business' | 'user' | 'balanced'
  include_priorities: boolean
}

export function createContentSummarizerPrompt(
  content: string,
  options: SummaryOptions
): string {
  const lengthInstructions = {
    brief: 'Keep the summary very concise, focusing on only the most essential points (100-200 words).',
    medium: 'Provide a balanced summary that covers key points comprehensively (200-400 words).',
    detailed: 'Create a thorough summary that preserves important details while being more concise than the original (400-600 words).'
  }

  const focusInstructions = {
    technical: 'Focus primarily on technical requirements, architecture, and implementation details.',
    business: 'Emphasize business objectives, market considerations, and strategic goals.',
    user: 'Highlight user needs, experience requirements, and customer-facing features.',
    balanced: 'Provide balanced coverage of technical, business, and user perspectives.'
  }

  return `Summarize the following content with a ${options.focus_area} focus:

${content}

Instructions:
- ${lengthInstructions[options.target_length!]}
- ${focusInstructions[options.focus_area!]}
- Extract the most important themes and key points
- ${options.include_priorities ? 'Identify and prioritize the most critical items with rationale' : 'Do not include priorities'}
- Provide accurate word counts for both original and summary
- Ensure the summary captures the essence while being significantly more concise

The summary should be self-contained and useful for someone who hasn't read the original content.`
}