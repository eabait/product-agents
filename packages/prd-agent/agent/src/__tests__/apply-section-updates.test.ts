import { PRDOrchestratorAgent } from '../prd-orchestrator-agent'
import { PRD, SectionRoutingResponse } from '../schemas'

describe('PRDOrchestratorAgent.applySectionUpdates', () => {
  it('syncs flattened fields with updated section content', () => {
    const agent = new PRDOrchestratorAgent({
      apiKey: 'test-key',
      model: 'test-model',
      temperature: 0.2,
      maxTokens: 4000
    })

    const existingPRD: PRD = {
      solutionOverview: 'Legacy overview',
      targetUsers: ['Persona A'],
      goals: ['Improve onboarding'],
      successMetrics: [
        { metric: 'Baseline active users', target: '5k MAU', timeline: '6 months' }
      ],
      constraints: ['Must operate offline'],
      assumptions: ['Users have smartphones'],
      sections: {
        targetUsers: { targetUsers: ['Persona A'] },
        solution: { solutionOverview: 'Legacy overview' },
        keyFeatures: { keyFeatures: ['Feature 1'] },
        successMetrics: {
          successMetrics: [
            { metric: 'Baseline active users', target: '5k MAU', timeline: '6 months' }
          ]
        },
        constraints: {
          constraints: ['Must operate offline'],
          assumptions: ['Users have smartphones']
        }
      },
      metadata: {
        version: '2.0',
        lastUpdated: new Date().toISOString(),
        generatedBy: 'PRD Orchestrator Agent',
        sections_generated: ['successMetrics'],
        confidence_assessments: {},
        overall_confidence: {
          level: 'medium',
          reasons: [],
          factors: {}
        }
      }
    }

    const updatedSections = {
      successMetrics: {
        successMetrics: [
          { metric: 'Monthly Gross Payment Volume', target: '$1.2M GMV', timeline: '9 months post-launch' },
          { metric: 'Premium Support Attach Rate', target: '30% of active users', timeline: '6 months post-launch' }
        ]
      }
    }

    const responseMetadata: SectionRoutingResponse['metadata'] = {
      sections_updated: ['successMetrics'],
      confidence_assessments: {},
      overall_confidence: {
        level: 'high',
        reasons: [],
        factors: {}
      },
      processing_time_ms: 1500,
      should_regenerate_prd: false
    }

    const result = (agent as any).applySectionUpdates(existingPRD, updatedSections, responseMetadata)

    expect(result.sections.successMetrics.successMetrics).toHaveLength(2)
    expect(result.successMetrics).toEqual(result.sections.successMetrics.successMetrics)
    expect(result.successMetrics?.[0].metric).toBe('Monthly Gross Payment Volume')
    expect(result.solutionOverview).toBe('Legacy overview')
    expect(result.targetUsers).toEqual(['Persona A'])
  })
})
