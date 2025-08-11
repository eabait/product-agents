import { z } from 'zod';

export const SuccessMetricSchema = z.object({
  metric: z.string().describe('The name or description of the metric'),
  target: z.string().describe('The target value or goal for this metric'),
  timeline: z.string().describe('When this target should be achieved'),
});

export const PRDSchema = z.object({
  problemStatement: z.string().describe('A clear description of the problem this product addresses'),
  solutionOverview: z.string().describe('High-level description of how the product will solve the problem'),
  targetUsers: z.array(z.string()).describe('List of target user personas or segments'),
  goals: z.array(z.string()).describe('List of product goals and objectives'),
  successMetrics: z.array(SuccessMetricSchema).describe('Measurable success criteria with targets and timelines'),
  constraints: z.array(z.string()).describe('Technical, business, or other limitations'),
  assumptions: z.array(z.string()).describe('Key assumptions made during planning'),
});

export type PRD = z.infer<typeof PRDSchema>;
export type SuccessMetric = z.infer<typeof SuccessMetricSchema>;