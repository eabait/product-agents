import { describe, it, expect } from '@jest/globals'
import { applyKeyFeaturesPlan } from '../key-features-section-writer'

const BASE_FEATURES = [
  '**Drag-and-Drop Boards**: Reorder tasks with intuitive drag interactions and custom columns',
  '**Real-time Notifications**: Instant alerts when tasks are updated or assignments change'
]

describe('applyKeyFeaturesPlan', () => {
  it('appends new features without removing existing ones', () => {
    const plan = {
      mode: 'append' as const,
      operations: [],
      proposedFeatures: [
        '**Capacity Planning**: Visualize team workload and balance assignments automatically'
      ]
    }

    const merged = applyKeyFeaturesPlan(BASE_FEATURES, plan)
    expect(merged).toHaveLength(3)
    expect(merged).toContain('**Capacity Planning**: Visualize team workload and balance assignments automatically')
  })

  it('removes a feature when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      operations: [
        {
          action: 'remove' as const,
          referenceFeature: BASE_FEATURES[1]
        }
      ],
      proposedFeatures: []
    }

    const merged = applyKeyFeaturesPlan(BASE_FEATURES, plan)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(BASE_FEATURES[0])
  })

  it('updates a feature when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      operations: [
        {
          action: 'update' as const,
          referenceFeature: BASE_FEATURES[0],
          feature: '**Advanced Boards**: Drag-and-drop prioritization with WIP limits and custom automation rules'
        }
      ],
      proposedFeatures: []
    }

    const merged = applyKeyFeaturesPlan(BASE_FEATURES, plan)
    expect(merged).toContain('**Advanced Boards**: Drag-and-drop prioritization with WIP limits and custom automation rules')
  })

  it('replaces features when mode is replace', () => {
    const plan = {
      mode: 'replace' as const,
      operations: [],
      proposedFeatures: [
        '**Analytics Dashboards**: Aggregate team performance metrics with exportable reports'
      ]
    }

    const merged = applyKeyFeaturesPlan(BASE_FEATURES, plan)
    expect(merged).toEqual([
      '**Analytics Dashboards**: Aggregate team performance metrics with exportable reports'
    ])
  })

  it('deduplicates features case-insensitively', () => {
    const plan = {
      mode: 'append' as const,
      operations: [
        {
          action: 'add' as const,
          feature: '**drag-and-drop boards**: Support Kanban-style workflows and reordering'
        }
      ],
      proposedFeatures: []
    }

    const merged = applyKeyFeaturesPlan(BASE_FEATURES, plan)
    expect(merged).toHaveLength(2)
  })
})

