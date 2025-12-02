import test from 'node:test'
import assert from 'node:assert/strict'

import { PrdSkillRunner } from '../src/adapters/skill-runner'
import { resolveRunSettings, getDefaultProductAgentConfig, type PlanNode } from '@product-agents/product-agent'
import {
  SECTION_NAMES,
  type SectionName,
  type SectionRoutingRequest,
  type SectionRoutingResponse
} from '@product-agents/prd-shared'

const fixedClock = () => new Date('2024-03-03T00:00:00.000Z')

class StubSectionWriter {
  constructor(private readonly section: SectionName) {}

  async writeSection() {
    return {
      name: this.section,
      content: { generated: `content-for-${this.section}` },
      shouldRegenerate: true,
      confidence: {
        level: 'high',
        reasons: [`stub confidence for ${this.section}`]
      },
      metadata: {
        validation_issues: []
      }
    }
  }
}

class StubClarificationAnalyzer {
  async analyze() {
    return {
      name: 'clarification',
      data: {
        needsClarification: false,
        confidence: {
          level: 'medium',
          reasons: ['stub clarification result']
        },
        missingCritical: [],
        questions: []
      },
      confidence: {
        level: 'medium',
        reasons: ['stub clarification analyzer']
      },
      metadata: {}
    }
  }
}

test('PrdSkillRunner composes context analysis, section writers, and assembly', async () => {
  const config = getDefaultProductAgentConfig()
  const settings = resolveRunSettings(config)

  const runner = new PrdSkillRunner({
    clock: fixedClock,
    factories: {
      createClarificationAnalyzer: () => new StubClarificationAnalyzer() as any,
      createContextAnalyzer: () => ({
        async analyze() {
          return {
            name: 'contextAnalysis',
            data: {
              themes: ['payments'],
              requirements: {
                functional: ['Process invoices'],
                technical: ['Integrate with Stripe'],
                user_experience: ['Mobile-first']
              },
              constraints: []
            },
            confidence: {
              level: 'medium',
              reasons: ['stub analyzer']
            },
            metadata: {}
          }
        }
      }) as any,
      createSectionWriter: section => new StubSectionWriter(section) as any
    }
  })

  const runInput: SectionRoutingRequest = {
    message: 'Draft a PRD for a lightweight invoicing app.',
    context: {}
  }

  const runContext = {
    runId: 'skill-run-1',
    request: {
      artifactKind: 'prd' as const,
      input: runInput,
      createdBy: 'unit-test'
    },
    settings,
    workspace: {
      descriptor: {
        runId: 'skill-run-1',
        root: '/tmp',
        createdAt: fixedClock(),
        kind: 'prd'
      },
      resolve: (...segments: string[]) => segments.join('/')
    },
    startedAt: fixedClock(),
    metadata: undefined
  }

  const clarificationNode: PlanNode = {
    id: 'clarification-check',
    label: 'Clarification check',
    task: { kind: 'clarification-check' },
    status: 'pending',
    dependsOn: [],
    metadata: { skillId: 'prd.check-clarification' }
  }

  const analysisNode: PlanNode = {
    id: 'analyze-context',
    label: 'Analyze context',
    task: { kind: 'analyze-context' },
    status: 'pending',
    dependsOn: ['clarification-check'],
    metadata: { skillId: 'prd.analyze-context' }
  }

  const targetNode: PlanNode = {
    id: 'write-targetUsers',
    label: 'Write target users',
    task: { kind: 'write-section', section: SECTION_NAMES.TARGET_USERS },
    status: 'pending',
    dependsOn: ['analyze-context'],
    metadata: { skillId: 'prd.write-targetUsers' }
  }

  const assembleNode: PlanNode = {
    id: 'assemble-prd',
    label: 'Assemble PRD',
    task: { kind: 'assemble-prd' },
    status: 'pending',
    dependsOn: ['write-targetUsers'],
    metadata: { skillId: 'prd.assemble-prd' }
  }

  await runner.invoke({
    skillId: 'prd.check-clarification',
    planNode: clarificationNode,
    input: clarificationNode.task,
    context: {
      run: runContext,
      step: clarificationNode
    }
  })

  await runner.invoke({
    skillId: 'prd.analyze-context',
    planNode: analysisNode,
    input: analysisNode.task,
    context: {
      run: runContext,
      step: analysisNode
    }
  })

  await runner.invoke({
    skillId: 'prd.write-targetUsers',
    planNode: targetNode,
    input: targetNode.task,
    context: {
      run: runContext,
      step: targetNode
    }
  })

  const assemblyResult = await runner.invoke({
    skillId: 'prd.assemble-prd',
    planNode: assembleNode,
    input: assembleNode.task,
    context: {
      run: runContext,
      step: assembleNode
    }
  })

  assert.ok(assemblyResult.output, 'expected assembly output')
  const response = assemblyResult.output as SectionRoutingResponse
  assert.equal((response as any).sections.targetUsers.generated, 'content-for-targetUsers')
  assert.equal((assemblyResult.metadata as any)?.artifact?.id, 'artifact-skill-run-1')
  assert.equal(assemblyResult.confidence, 0.9)

  const secondRunContext = {
    ...runContext,
    runId: 'skill-run-2',
    request: {
      ...runContext.request,
      createdBy: 'unit-test-2'
    }
  }

  await runner.invoke({
    skillId: 'prd.check-clarification',
    planNode: clarificationNode,
    input: clarificationNode.task,
    context: {
      run: secondRunContext,
      step: clarificationNode
    }
  })

  await runner.invoke({
    skillId: 'prd.analyze-context',
    planNode: analysisNode,
    input: analysisNode.task,
    context: {
      run: secondRunContext,
      step: analysisNode
    }
  })

  await runner.invoke({
    skillId: 'prd.write-targetUsers',
    planNode: targetNode,
    input: targetNode.task,
    context: {
      run: secondRunContext,
      step: targetNode
    }
  })

  const secondAssembly = await runner.invoke({
    skillId: 'prd.assemble-prd',
    planNode: assembleNode,
    input: assembleNode.task,
    context: {
      run: secondRunContext,
      step: assembleNode
    }
  })

  assert.equal((secondAssembly.metadata as any)?.artifact?.id, 'artifact-skill-run-2')
})
