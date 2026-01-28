import test from 'node:test'
import assert from 'node:assert/strict'

import { PlanTranslator, createPlanTranslator } from '../../src/orchestrator/plan-translator'
import { MOCK_TOOLS } from './scenarios'

const fixedClock = () => new Date('2024-01-15T10:00:00.000Z')

const createTranslator = (runId = 'test-run') =>
  createPlanTranslator({
    tools: MOCK_TOOLS,
    runId,
    clock: fixedClock
  })

test('PlanTranslator', async (t) => {
  await t.test('parseOutput', async (t) => {
    await t.test('parses valid JSON output', () => {
      const translator = createTranslator()
      const output = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'User wants a PRD',
        confidence: 0.9,
        steps: [
          {
            id: 'step-1',
            toolId: 'prd.analyze-context',
            toolType: 'skill',
            label: 'Analyze Context',
            rationale: 'Need to understand requirements',
            dependsOn: []
          }
        ]
      })

      const parsed = translator.parseOutput(output)
      assert.equal(parsed.targetArtifact, 'prd')
      assert.equal(parsed.overallRationale, 'User wants a PRD')
      assert.equal(parsed.confidence, 0.9)
      assert.equal(parsed.steps.length, 1)
    })

    await t.test('removes markdown code blocks', () => {
      const translator = createTranslator()
      const output = `\`\`\`json
{
  "targetArtifact": "prd",
  "overallRationale": "Test",
  "confidence": 0.8,
  "steps": [{
    "id": "step-1",
    "toolId": "prd.analyze-context",
    "toolType": "skill",
    "label": "Test",
    "rationale": "Test",
    "dependsOn": []
  }]
}
\`\`\``

      const parsed = translator.parseOutput(output)
      assert.equal(parsed.targetArtifact, 'prd')
    })

    await t.test('throws on invalid JSON', () => {
      const translator = createTranslator()
      assert.throws(
        () => translator.parseOutput('not valid json'),
        /Invalid JSON/
      )
    })

    await t.test('throws on missing targetArtifact', () => {
      const translator = createTranslator()
      const output = JSON.stringify({
        overallRationale: 'Test',
        confidence: 0.8,
        steps: []
      })
      assert.throws(
        () => translator.parseOutput(output),
        /Missing required field: targetArtifact/
      )
    })

    await t.test('throws on missing overallRationale', () => {
      const translator = createTranslator()
      const output = JSON.stringify({
        targetArtifact: 'prd',
        confidence: 0.8,
        steps: []
      })
      assert.throws(
        () => translator.parseOutput(output),
        /Missing required field: overallRationale/
      )
    })

    await t.test('throws on missing confidence', () => {
      const translator = createTranslator()
      const output = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        steps: []
      })
      assert.throws(
        () => translator.parseOutput(output),
        /Missing or invalid field: confidence/
      )
    })

    await t.test('throws on missing steps', () => {
      const translator = createTranslator()
      const output = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8
      })
      assert.throws(
        () => translator.parseOutput(output),
        /Missing or invalid field: steps/
      )
    })

    await t.test('validates individual step fields', () => {
      const translator = createTranslator()
      const output = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [{ id: 'step-1' }] // Missing required fields
      })
      assert.throws(
        () => translator.parseOutput(output),
        /Step 0 missing required field: toolId/
      )
    })

    await t.test('defaults dependsOn to empty array if missing', () => {
      const translator = createTranslator()
      const output = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [{
          id: 'step-1',
          toolId: 'prd.analyze-context',
          toolType: 'skill',
          label: 'Test',
          rationale: 'Test'
          // dependsOn not provided
        }]
      })

      const parsed = translator.parseOutput(output)
      assert.deepEqual(parsed.steps[0].dependsOn, [])
    })
  })

  await t.test('validate', async (t) => {
    await t.test('fails on empty plan', () => {
      const translator = createTranslator()
      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: []
      })

      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('no steps')))
    })

    await t.test('fails on duplicate step IDs', () => {
      const translator = createTranslator()
      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'A', rationale: 'A', dependsOn: [] },
          { id: 'step-1', toolId: 'prd.write-overview', toolType: 'skill', label: 'B', rationale: 'B', dependsOn: [] }
        ]
      })

      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('Duplicate step ID')))
    })

    await t.test('fails on unknown dependency', () => {
      const translator = createTranslator()
      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'A', rationale: 'A', dependsOn: ['nonexistent'] }
        ]
      })

      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('depends on unknown step')))
    })

    await t.test('fails on unknown tool reference', () => {
      const translator = createTranslator()
      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'unknown.tool', toolType: 'skill', label: 'A', rationale: 'A', dependsOn: [] }
        ]
      })

      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('unknown tool')))
    })

    await t.test('fails on circular dependencies', () => {
      const translator = createTranslator()
      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'A', rationale: 'A', dependsOn: ['step-2'] },
          { id: 'step-2', toolId: 'prd.write-overview', toolType: 'skill', label: 'B', rationale: 'B', dependsOn: ['step-1'] }
        ]
      })

      assert.equal(result.valid, false)
      assert.ok(result.errors.some(e => e.includes('Circular dependency')))
    })

    await t.test('warns on low confidence', () => {
      const translator = createTranslator()
      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.3,
        clarifications: [
          'Who are the users?',
          'Which market segment?',
          'What differentiates this product?'
        ],
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'A', rationale: 'A', dependsOn: [] }
        ]
      })

      assert.equal(result.valid, true)
      assert.ok(result.warnings.some(w => w.includes('Low confidence')))
    })

    await t.test('warns on many steps', () => {
      const translator = createTranslator()
      const manySteps = Array.from({ length: 12 }, (_, i) => ({
        id: `step-${i + 1}`,
        toolId: 'prd.analyze-context',
        toolType: 'skill' as const,
        label: `Step ${i + 1}`,
        rationale: 'Test',
        dependsOn: i > 0 ? [`step-${i}`] : []
      }))

      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: manySteps
      })

      assert.equal(result.valid, true)
      assert.ok(result.warnings.some(w => w.includes('12 steps')))
    })

    await t.test('passes valid plan', () => {
      const translator = createTranslator()
      const result = translator.validate({
        targetArtifact: 'prd',
        overallRationale: 'Good plan for PRD generation',
        confidence: 0.85,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'Analyze', rationale: 'Need context', dependsOn: [] },
          { id: 'step-2', toolId: 'prd.write-overview', toolType: 'skill', label: 'Write Overview', rationale: 'Start with overview', dependsOn: ['step-1'] }
        ]
      })

      assert.equal(result.valid, true)
      assert.equal(result.errors.length, 0)
    })
  })

  await t.test('translateToPlanGraph', async (t) => {
    await t.test('creates valid PlanGraph structure', () => {
      const translator = createTranslator('run-123')
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Generate PRD from context',
        confidence: 0.9,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'Analyze', rationale: 'First step', dependsOn: [] },
          { id: 'step-2', toolId: 'prd.write-overview', toolType: 'skill' as const, label: 'Write Overview', rationale: 'Second step', dependsOn: ['step-1'] }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)

      assert.equal(plan.id, 'plan-run-123')
      assert.equal(plan.artifactKind, 'prd')
      assert.equal(plan.entryId, 'step-1') // First step with no dependencies
      assert.deepEqual(plan.createdAt, fixedClock())
      assert.ok(plan.version)
      assert.equal(Object.keys(plan.nodes).length, 2)
    })

    await t.test('sets correct entry point for step without dependencies', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-2', toolId: 'prd.write-overview', toolType: 'skill' as const, label: 'B', rationale: 'B', dependsOn: ['step-1'] },
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'A', rationale: 'A', dependsOn: [] }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)
      assert.equal(plan.entryId, 'step-1') // Even though step-2 is listed first
    })

    await t.test('creates correct node structure for skills', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'Analyze Context', rationale: 'Need to understand', dependsOn: [] }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)
      const node = plan.nodes['step-1']

      assert.equal(node.id, 'step-1')
      assert.equal(node.label, 'Analyze Context')
      assert.equal(node.status, 'pending')
      assert.deepEqual(node.dependsOn, [])
      assert.equal(node.metadata?.kind, 'skill')
      assert.equal(node.metadata?.skillId, 'prd.analyze-context')
      assert.equal(node.metadata?.rationale, 'Need to understand')
    })

    await t.test('creates correct node structure for subagents', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'research',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'research.core.agent', toolType: 'subagent' as const, label: 'Research Market', rationale: 'Gather context', dependsOn: [], outputArtifact: 'research' }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)
      const node = plan.nodes['step-1']

      assert.equal(node.metadata?.kind, 'subagent')
      assert.equal(node.metadata?.subagentId, 'research.core.agent')
      assert.equal(node.metadata?.artifactKind, 'research')
      assert.deepEqual(node.task, { kind: 'subagent', agentId: 'research.core.agent' })
    })

    await t.test('maps skill task kinds correctly', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-0', toolId: 'clarification.check', toolType: 'skill' as const, label: 'Clarify', rationale: 'Check', dependsOn: [] },
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'Analyze', rationale: 'Analyze', dependsOn: ['step-0'] },
          { id: 'step-2', toolId: 'prd.assemble-prd', toolType: 'skill' as const, label: 'Assemble', rationale: 'Assemble', dependsOn: ['step-1'] }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)

      assert.deepEqual(plan.nodes['step-0'].task, { kind: 'clarification-check' })
      assert.deepEqual(plan.nodes['step-1'].task, { kind: 'analyze-context' })
      assert.deepEqual(plan.nodes['step-2'].task, { kind: 'assemble-prd' })
    })

    await t.test('maps legacy clarification id for compatibility', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.check-clarification', toolType: 'skill' as const, label: 'Clarify', rationale: 'Check', dependsOn: [] }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)
      assert.deepEqual(plan.nodes['step-1'].task, { kind: 'clarification-check' })
    })

    await t.test('handles section writer skills', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.write-overview', toolType: 'skill' as const, label: 'Write Overview', rationale: 'Test', dependsOn: [] }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)
      assert.deepEqual(plan.nodes['step-1'].task, { kind: 'write-section', section: 'overview' })
    })

    await t.test('includes metadata in plan', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'This is the overall rationale',
        confidence: 0.75,
        warnings: ['Low context available'],
        clarifications: ['What is the target market?'],
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'Test', rationale: 'Test', dependsOn: [] }
        ]
      }

      const plan = translator.translateToPlanGraph(raw)

      assert.equal(plan.metadata?.orchestrator, 'llm-orchestrator')
      assert.equal(plan.metadata?.confidence, 0.75)
      assert.equal(plan.metadata?.overallRationale, 'This is the overall rationale')
      assert.deepEqual(plan.metadata?.warnings, ['Low context available'])
      assert.deepEqual(plan.metadata?.clarifications, ['What is the target market?'])
    })
  })

  await t.test('translateToStepProposals', async (t) => {
    await t.test('creates step proposals from raw steps', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'Analyze', rationale: 'Need context', dependsOn: [], outputArtifact: 'prd' },
          { id: 'step-2', toolId: 'persona.builder', toolType: 'subagent' as const, label: 'Build Personas', rationale: 'Create personas', dependsOn: ['step-1'], outputArtifact: 'persona' }
        ]
      }

      const proposals = translator.translateToStepProposals(raw)

      assert.equal(proposals.length, 2)
      assert.equal(proposals[0].id, 'step-1')
      assert.equal(proposals[0].toolId, 'prd.analyze-context')
      assert.equal(proposals[0].toolType, 'skill')
      assert.equal(proposals[0].label, 'Analyze')
      assert.equal(proposals[0].rationale, 'Need context')
      assert.deepEqual(proposals[0].dependsOn, [])
      assert.equal(proposals[0].outputArtifact, 'prd')

      assert.equal(proposals[1].id, 'step-2')
      assert.equal(proposals[1].toolType, 'subagent')
      assert.deepEqual(proposals[1].dependsOn, ['step-1'])
    })
  })

  await t.test('translate (full pipeline)', async (t) => {
    await t.test('creates complete OrchestratorPlanProposal', () => {
      const translator = createTranslator('run-456')
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Complete PRD generation plan',
        confidence: 0.85,
        warnings: ['Some warning'],
        clarifications: [
          'Who are the primary users?',
          'Which market or region should we prioritize?',
          'What differentiates this product?'
        ],
        steps: [
          { id: 'step-1', toolId: 'research.core.agent', toolType: 'subagent' as const, label: 'Research', rationale: 'Gather context', dependsOn: [], outputArtifact: 'research' },
          { id: 'step-2', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'Analyze', rationale: 'Process context', dependsOn: ['step-1'] }
        ]
      }

      const proposal = translator.translate(raw)

      assert.ok(proposal.plan)
      assert.equal(proposal.plan.id, 'plan-run-456')
      assert.equal(proposal.steps.length, 2)
      assert.equal(proposal.overallRationale, 'Complete PRD generation plan')
      assert.equal(proposal.confidence, 0.85)
      assert.equal(proposal.targetArtifact, 'prd')
      assert.deepEqual(proposal.warnings, ['Some warning'])
      assert.deepEqual(proposal.suggestedClarifications, [
        'Who are the primary users?',
        'Which market or region should we prioritize?',
        'What differentiates this product?'
      ])
    })

    await t.test('merges validation warnings with LLM warnings', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.3, // Low confidence triggers warning
        warnings: ['LLM warning'],
        clarifications: [
          'Who are the users?',
          'Which market segment?',
          'What is the differentiation?'
        ],
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill' as const, label: 'Test', rationale: 'Test', dependsOn: [] }
        ]
      }

      const proposal = translator.translate(raw)

      assert.ok(proposal.warnings)
      assert.ok(proposal.warnings.some(w => w === 'LLM warning'))
      assert.ok(proposal.warnings.some(w => w.includes('Low confidence')))
    })

    await t.test('throws on invalid plan', () => {
      const translator = createTranslator()
      const raw = {
        targetArtifact: 'prd',
        overallRationale: 'Test',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'unknown.tool', toolType: 'skill' as const, label: 'Test', rationale: 'Test', dependsOn: [] }
        ]
      }

      assert.throws(
        () => translator.translate(raw),
        /Invalid plan.*unknown tool/
      )
    })
  })

  await t.test('factory function', async (t) => {
    await t.test('creates translator with provided options', () => {
      const translator = createPlanTranslator({
        tools: MOCK_TOOLS,
        runId: 'factory-test',
        clock: fixedClock
      })

      assert.ok(translator instanceof PlanTranslator)
    })
  })
})
