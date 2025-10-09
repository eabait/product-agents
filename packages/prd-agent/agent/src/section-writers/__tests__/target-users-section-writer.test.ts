import { describe, it, expect } from '@jest/globals'
import { applyTargetUsersPlan } from '../target-users-section-writer'

const BASE_USERS = [
  'Project managers in mid-sized technology companies coordinating cross-functional teams',
  'Team leads overseeing distributed remote teams that need visibility into progress'
]

describe('applyTargetUsersPlan', () => {
  it('appends new personas without removing existing ones', () => {
    const plan = {
      mode: 'append' as const,
      operations: [],
      proposedUsers: ['Operations directors at fast-growing startups who need scalable collaboration processes']
    }

    const merged = applyTargetUsersPlan(BASE_USERS, plan)
    expect(merged).toHaveLength(3)
    expect(merged).toContain('Operations directors at fast-growing startups who need scalable collaboration processes')
  })

  it('removes a persona when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      operations: [
        {
          action: 'remove' as const,
          referenceUser: 'Team leads overseeing distributed remote teams that need visibility into progress'
        }
      ],
      proposedUsers: []
    }

    const merged = applyTargetUsersPlan(BASE_USERS, plan)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(BASE_USERS[0])
  })

  it('updates a persona when requested', () => {
    const plan = {
      mode: 'smart_merge' as const,
      operations: [
        {
          action: 'update' as const,
          referenceUser: BASE_USERS[0],
          user: 'Program managers at enterprise organizations coordinating multiple initiatives'
        }
      ],
      proposedUsers: []
    }

    const merged = applyTargetUsersPlan(BASE_USERS, plan)
    expect(merged).toHaveLength(2)
    expect(merged).toContain('Program managers at enterprise organizations coordinating multiple initiatives')
  })

  it('replaces personas when mode is replace', () => {
    const plan = {
      mode: 'replace' as const,
      operations: [],
      proposedUsers: [
        'Customer support leads at SaaS companies handling high ticket volumes'
      ]
    }

    const merged = applyTargetUsersPlan(BASE_USERS, plan)
    expect(merged).toEqual([
      'Customer support leads at SaaS companies handling high ticket volumes'
    ])
  })

  it('deduplicates personas case-insensitively', () => {
    const plan = {
      mode: 'append' as const,
      operations: [
        {
          action: 'add' as const,
          user: 'project managers in mid-sized technology companies coordinating cross-functional teams'
        }
      ],
      proposedUsers: []
    }

    const merged = applyTargetUsersPlan(BASE_USERS, plan)
    expect(merged).toHaveLength(2)
  })
})

