import { describe, it, expect } from '@jest/globals'
import { applySuccessMetricsPlan } from '../success-metrics-section-writer'

const BASE_METRICS = [
  {
    metric: 'Monthly Active Users',
    target: '5,000 MAU within 6 months',
    timeline: '6 months post-launch'
  },
  {
    metric: 'Task Completion Rate',
    target: '85% of users complete core flow',
    timeline: 'First 30 days after launch'
  }
]

describe('applySuccessMetricsPlan', () => {
  it('appends new metrics without removing existing ones', () => {
    const plan = {
      mode: 'append' as const,
      operations: [],
      proposedMetrics: [
        {
          metric: 'Monetization Conversion',
          target: '3% upgrade rate within 90 days',
          timeline: '90 days post-launch'
        }
      ]
    }

    const merged = applySuccessMetricsPlan(BASE_METRICS, plan)
    expect(merged).toHaveLength(3)
    expect(merged.some(m => m.metric === 'Monetization Conversion')).toBe(true)
  })

  it('removes a specific metric when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      operations: [
        {
          action: 'remove' as const,
          referenceMetric: 'Task Completion Rate'
        }
      ],
      proposedMetrics: []
    }

    const merged = applySuccessMetricsPlan(BASE_METRICS, plan)
    expect(merged).toHaveLength(1)
    expect(merged[0].metric).toBe('Monthly Active Users')
  })

  it('updates a metric in place when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      operations: [
        {
          action: 'update' as const,
          referenceMetric: 'Monthly Active Users',
          target: '7,500 MAU within 6 months'
        }
      ],
      proposedMetrics: []
    }

    const merged = applySuccessMetricsPlan(BASE_METRICS, plan)
    expect(merged).toHaveLength(2)
    const updated = merged.find(m => m.metric === 'Monthly Active Users')
    expect(updated?.target).toBe('7,500 MAU within 6 months')
  })

  it('replaces all metrics when mode is replace', () => {
    const plan = {
      mode: 'replace' as const,
      operations: [],
      proposedMetrics: [
        {
          metric: 'Revenue Per User',
          target: '$15 ARPU by end of Q3',
          timeline: 'End of Q3'
        }
      ]
    }

    const merged = applySuccessMetricsPlan(BASE_METRICS, plan)
    expect(merged).toHaveLength(1)
    expect(merged[0].metric).toBe('Revenue Per User')
  })

  it('deduplicates metrics by name', () => {
    const plan = {
      mode: 'append' as const,
      operations: [
        {
          action: 'add' as const,
          metric: 'Monthly Active Users',
          target: '6,000 MAU within 6 months',
          timeline: '6 months post-launch'
        }
      ],
      proposedMetrics: []
    }

    const merged = applySuccessMetricsPlan(BASE_METRICS, plan)
    expect(merged).toHaveLength(2)
    const updated = merged.find(m => m.metric === 'Monthly Active Users')
    expect(updated?.target).toBe('6,000 MAU within 6 months')
  })
})

