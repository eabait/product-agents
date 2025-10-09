import { describe, it, expect } from '@jest/globals'
import { applyConstraintsPlan } from '../constraints-section-writer'

const BASE_CONSTRAINTS = [
  'Must deploy within 6 months to capture market window',
  'Total development budget limited to $250,000 including third-party services'
]

const BASE_ASSUMPTIONS = [
  'Target customers already use modern smartphones with reliable internet access',
  'Customer support team can handle increased ticket volume during launch'
]

describe('applyConstraintsPlan', () => {
  it('appends constraints and assumptions without removing existing ones', () => {
    const plan = {
      mode: 'append' as const,
      constraints: {
        operations: [],
        proposed: ['Must comply with HIPAA data handling requirements']
      },
      assumptions: {
        operations: [],
        proposed: ['Security review team is available within 2 weeks of code complete']
      }
    }

    const merged = applyConstraintsPlan(BASE_CONSTRAINTS, BASE_ASSUMPTIONS, plan)
    expect(merged.constraints).toHaveLength(3)
    expect(merged.assumptions).toHaveLength(3)
  })

  it('removes specific entries when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      constraints: {
        operations: [
          { action: 'remove' as const, reference: BASE_CONSTRAINTS[1] }
        ],
        proposed: []
      },
      assumptions: {
        operations: [
          { action: 'remove' as const, reference: BASE_ASSUMPTIONS[0] }
        ],
        proposed: []
      }
    }

    const merged = applyConstraintsPlan(BASE_CONSTRAINTS, BASE_ASSUMPTIONS, plan)
    expect(merged.constraints).toHaveLength(1)
    expect(merged.assumptions).toHaveLength(1)
    expect(merged.constraints[0]).toBe(BASE_CONSTRAINTS[0])
    expect(merged.assumptions[0]).toBe(BASE_ASSUMPTIONS[1])
  })

  it('updates entries when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      constraints: {
        operations: [
          {
            action: 'update' as const,
            reference: BASE_CONSTRAINTS[0],
            value: 'Must deploy within 4 months to align with marketing campaign launch'
          }
        ],
        proposed: []
      },
      assumptions: {
        operations: [
          {
            action: 'update' as const,
            reference: BASE_ASSUMPTIONS[1],
            value: 'Customer support team can allocate two dedicated agents during launch month'
          }
        ],
        proposed: []
      }
    }

    const merged = applyConstraintsPlan(BASE_CONSTRAINTS, BASE_ASSUMPTIONS, plan)
    expect(merged.constraints).toContain('Must deploy within 4 months to align with marketing campaign launch')
    expect(merged.assumptions).toContain('Customer support team can allocate two dedicated agents during launch month')
  })

  it('replaces entries when mode is replace', () => {
    const plan = {
      mode: 'replace' as const,
      constraints: {
        operations: [],
        proposed: ['Must pass SOC 2 Type II audit before general availability']
      },
      assumptions: {
        operations: [],
        proposed: ['Sales team will coordinate enterprise pilots within first quarter']
      }
    }

    const merged = applyConstraintsPlan(BASE_CONSTRAINTS, BASE_ASSUMPTIONS, plan)
    expect(merged.constraints).toEqual(['Must pass SOC 2 Type II audit before general availability'])
    expect(merged.assumptions).toEqual(['Sales team will coordinate enterprise pilots within first quarter'])
  })

  it('deduplicates entries', () => {
    const plan = {
      mode: 'append' as const,
      constraints: {
        operations: [
          { action: 'add' as const, value: 'must deploy within 6 months to capture market window' }
        ],
        proposed: []
      },
      assumptions: {
        operations: [],
        proposed: []
      }
    }

    const merged = applyConstraintsPlan(BASE_CONSTRAINTS, BASE_ASSUMPTIONS, plan)
    expect(merged.constraints).toHaveLength(2)
  })
})

