import type { SubagentLifecycle } from '../../src/contracts/subagent'

export const createTestSubagent = (): SubagentLifecycle => ({
  metadata: {
    id: 'test.subagent',
    label: 'Test Subagent',
    version: '0.0.1',
    artifactKind: 'persona',
    sourceKinds: ['prd'],
    description: 'Fixture subagent for registry tests',
    tags: ['test']
  },
  async execute() {
    return {
      artifact: {
        id: 'test-artifact',
        kind: 'persona',
        version: '1.0.0',
        label: 'Persona Draft',
        data: {
          personas: []
        },
        metadata: {
          createdAt: new Date().toISOString()
        }
      },
      metadata: {
        note: 'fixture'
      }
    }
  }
})

export default createTestSubagent
