import { createClarificationPrompt } from '../clarification'
import { createContextAnalysisPrompt } from '../context-analysis'
import { createSectionDetectionPrompt } from '../section-detection'
import { createSolutionSectionPrompt } from '../solution-section'
import { createKeyFeaturesSectionPrompt } from '../key-features-section'
import { createSuccessMetricsSectionPrompt } from '../success-metrics-section'
import { createConstraintsSectionPrompt } from '../constraints-section'
import { createTargetUsersSectionPrompt } from '../target-users-section'
import { SectionWriterInput } from '../../section-writers/base-section-writer'

const contextAnalysisSample = {
  themes: ['Analytics enablement', 'Enterprise readiness'],
  requirements: {
    functional: ['Stream KPIs in real time', 'Provide historical comparisons'],
    technical: ['Integrate with Snowflake warehouse'],
    user_experience: ['Accessible dashboards meeting WCAG 2.1 AA'],
    epics: [
      {
        title: 'Real-time dashboards',
        description: 'Operations leaders view live performance trends.'
      }
    ],
    mvpFeatures: ['Live KPI dashboard', 'Alert subscription management']
  },
  constraints: ['Must comply with SOC 2 Type II']
}

const existingPrdSample = {
  sections: {
    targetUsers: {
      targetUsers: [
        'Operations managers at mid-market retail companies needing live visibility'
      ]
    },
    solution: {
      solutionOverview:
        'We currently provide scheduled analytics reports summarizing daily performance.',
      approach: 'Deliver enhancements in three phases aligned to quarterly releases.'
    },
    keyFeatures: {
      keyFeatures: [
        'Automated scheduled reports delivered via email',
        'Role-based dashboards for executives and managers'
      ]
    },
    successMetrics: {
      successMetrics: [
        {
          metric: 'Weekly Active Analysts',
          target: '60% of analysts log in weekly',
          timeline: 'Within two quarters of launch'
        }
      ]
    },
    constraints: {
      constraints: ['Dependent on data warehouse refresh time under five minutes'],
      assumptions: ['Data engineering team maintains ingestion pipeline health']
    }
  }
}

const baseInput: SectionWriterInput = {
  message: 'Add real-time analytics for enterprise customers and update the launch strategy.',
  context: {
    existingPRD: existingPrdSample,
    contextPayload: undefined,
    existingSection: undefined,
    previousResults: undefined,
    sharedAnalysisResults: undefined,
    targetSection: undefined
  }
}

describe('Prompt builders', () => {
  it('creates clarification prompt snapshot', () => {
    const prompt = createClarificationPrompt(
      'Build a PRD for a mobile app but I only have a rough idea so far.'
    )
    expect(prompt).toMatchSnapshot()
  })

  it('creates context analysis prompt snapshot', () => {
    const prompt = createContextAnalysisPrompt('We need live analytics for enterprise clients.', {
      categorizedContext: [
        {
          id: 'ctx-1',
          category: 'constraint',
          title: 'Compliance',
          content: 'Must retain data for 24 months to satisfy enterprise audit needs.',
          priority: 'high',
          isActive: true
        },
        {
          id: 'ctx-2',
          category: 'requirement',
          title: 'Scalability',
          content: 'Handle 5k concurrent viewers without latency spikes.',
          priority: 'medium',
          isActive: true
        }
      ]
    })
    expect(prompt).toMatchSnapshot()
  })

  it('creates section detection prompt snapshot', () => {
    const prompt = createSectionDetectionPrompt(
      'Tighten our constraints for compliance and add engagement metrics.',
      existingPrdSample
    )
    expect(prompt).toMatchSnapshot()
  })

  it('creates solution prompt snapshot', () => {
    const prompt = createSolutionSectionPrompt(
      baseInput,
      contextAnalysisSample
    )
    expect(prompt).toMatchSnapshot()
  })

  it('creates key features prompt snapshot', () => {
    const promptInput: SectionWriterInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        existingSection: {
          keyFeatures: [
            'Automated anomaly detection alerts',
            'Executive digest summarizing weekly performance'
          ]
        }
      }
    }

    const prompt = createKeyFeaturesSectionPrompt(
      promptInput,
      contextAnalysisSample,
      ['Automated anomaly detection alerts']
    )
    expect(prompt).toMatchSnapshot()
  })

  it('creates success metrics prompt snapshot', () => {
    const promptInput: SectionWriterInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        existingSection: {
          successMetrics: [
            {
              metric: 'Dashboard adoption',
              target: '75% of eligible users log in weekly',
              timeline: '90 days post-launch'
            }
          ]
        }
      }
    }

    const prompt = createSuccessMetricsSectionPrompt(
      promptInput,
      contextAnalysisSample
    )
    expect(prompt).toMatchSnapshot()
  })

  it('creates constraints prompt snapshot', () => {
    const prompt = createConstraintsSectionPrompt(
      baseInput,
      contextAnalysisSample,
      ['Must comply with SOC 2 Type II'],
      ['Data warehouse maintains <5 minute latency']
    )
    expect(prompt).toMatchSnapshot()
  })

  it('creates target users prompt snapshot', () => {
    const promptInput: SectionWriterInput = {
      ...baseInput,
      context: {
        ...baseInput.context,
        existingSection: [
          'Regional operations managers overseeing daily retail performance'
        ]
      }
    }

    const prompt = createTargetUsersSectionPrompt(
      promptInput,
      contextAnalysisSample,
      ['Regional operations managers overseeing daily retail performance']
    )
    expect(prompt).toMatchSnapshot()
  })
})
