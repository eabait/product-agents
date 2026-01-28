import test from 'node:test'
import assert from 'node:assert/strict'

import { PromptBuilder, createPromptBuilder } from '../../src/orchestrator/prompt-builder'
import type { OrchestratorInput, ToolDescriptor } from '../../src/contracts/orchestrator'
import { MOCK_TOOLS } from './scenarios'

const createInput = (message: string, overrides?: Partial<OrchestratorInput>): OrchestratorInput => ({
  message,
  existingArtifacts: new Map(),
  ...overrides
})

test('PromptBuilder', async (t) => {
  await t.test('buildSystemPrompt', async (t) => {
    await t.test('includes all provided tools', () => {
      const builder = createPromptBuilder()
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)

      // Check skills are included
      assert.ok(prompt.includes('clarification.check'), 'Should include clarification.check')
      assert.ok(prompt.includes('prd.analyze-context'), 'Should include prd.analyze-context')
      assert.ok(prompt.includes('prd.assemble-prd'), 'Should include prd.assemble-prd')

      // Check subagents are included
      assert.ok(prompt.includes('research.core.agent'), 'Should include research.core.agent')
      assert.ok(prompt.includes('persona.builder'), 'Should include persona.builder')
    })

    await t.test('groups tools by type when configured', () => {
      const builder = createPromptBuilder({ groupToolsByType: true })
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)

      assert.ok(prompt.includes('### Skills'), 'Should have Skills section')
      assert.ok(prompt.includes('### Subagents'), 'Should have Subagents section')
    })

    await t.test('includes planning rules', () => {
      const builder = createPromptBuilder()
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)

      assert.ok(prompt.includes('## Planning Rules'), 'Should include planning rules section')
      assert.ok(prompt.includes('Dependency Order'), 'Should mention dependency order rule')
      assert.ok(prompt.includes('No Cycles'), 'Should mention no cycles rule')
      assert.ok(prompt.includes('Clarify Before Planning'), 'Should mention clarify before planning rule')
    })

    await t.test('includes output schema', () => {
      const builder = createPromptBuilder()
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)

      assert.ok(prompt.includes('## Output Format'), 'Should include output format section')
      assert.ok(prompt.includes('targetArtifact'), 'Should specify targetArtifact field')
      assert.ok(prompt.includes('overallRationale'), 'Should specify overallRationale field')
      assert.ok(prompt.includes('confidence'), 'Should specify confidence field')
      assert.ok(prompt.includes('steps'), 'Should specify steps field')
    })

    await t.test('includes examples when configured', () => {
      const builder = createPromptBuilder({ includeExamples: true })
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)

      assert.ok(prompt.includes('## Example Plans'), 'Should include examples section')
      assert.ok(prompt.includes('Example 1'), 'Should include first example')
      assert.ok(prompt.includes('Example 2'), 'Should include second example')
    })

    await t.test('excludes examples when configured', () => {
      const builder = createPromptBuilder({ includeExamples: false })
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)

      assert.ok(!prompt.includes('## Example Plans'), 'Should not include examples section')
    })

    await t.test('includes clarification and research guidance for vague requests', () => {
      const builder = createPromptBuilder()
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)

      assert.ok(
        prompt.includes('When to Ask for Clarifications'),
        'Should include clarification guidance'
      )
      assert.ok(
        prompt.includes('When to Start with Research'),
        'Should include research guidance'
      )
      assert.ok(
        prompt.includes('target users') || prompt.includes('target audience'),
        'Should mention target users/audience as context requirement'
      )
      assert.ok(
        prompt.includes('problem') || prompt.includes('use case'),
        'Should mention problem or use cases as context requirement'
      )
    })
  })

  await t.test('buildUserPrompt', async (t) => {
    await t.test('includes user message', () => {
      const builder = createPromptBuilder()
      const input = createInput('Create a PRD for a task management app')
      const prompt = builder.buildUserPrompt(input)

      assert.ok(prompt.includes('## User Request'), 'Should have user request section')
      assert.ok(
        prompt.includes('Create a PRD for a task management app'),
        'Should include the user message'
      )
    })

    await t.test('indicates no existing artifacts when empty', () => {
      const builder = createPromptBuilder()
      const input = createInput('Create a PRD')
      const prompt = builder.buildUserPrompt(input)

      assert.ok(prompt.includes('## Existing Artifacts'), 'Should have artifacts section')
      assert.ok(
        prompt.includes('No existing artifacts available'),
        'Should indicate no artifacts'
      )
    })

    await t.test('lists existing artifacts when present', () => {
      const builder = createPromptBuilder()
      const existingArtifacts = new Map([
        ['research', [{ id: 'research-1', kind: 'research', version: '1.0', label: 'Market Research' }]]
      ])
      const input = createInput('Create personas based on research', { existingArtifacts })
      const prompt = builder.buildUserPrompt(input)

      assert.ok(prompt.includes('research'), 'Should list research artifact')
      assert.ok(prompt.includes('Market Research'), 'Should include artifact label')
    })

    await t.test('includes conversation history when present', () => {
      const builder = createPromptBuilder({ maxHistoryMessages: 5 })
      const input = createInput('Now create the personas', {
        conversationHistory: [
          { role: 'user', content: 'I need help with product planning' },
          { role: 'assistant', content: 'I can help with that. What product are you building?' }
        ]
      })
      const prompt = builder.buildUserPrompt(input)

      assert.ok(prompt.includes('## Conversation History'), 'Should have history section')
      assert.ok(
        prompt.includes('I need help with product planning'),
        'Should include user message from history'
      )
      assert.ok(
        prompt.includes('I can help with that'),
        'Should include assistant message from history'
      )
    })

    await t.test('limits conversation history to configured max', () => {
      const builder = createPromptBuilder({ maxHistoryMessages: 2 })
      const input = createInput('Continue', {
        conversationHistory: [
          { role: 'user', content: 'Message 1' },
          { role: 'assistant', content: 'Response 1' },
          { role: 'user', content: 'Message 2' },
          { role: 'assistant', content: 'Response 2' },
          { role: 'user', content: 'Message 3' }
        ]
      })
      const prompt = builder.buildUserPrompt(input)

      // Should only include last 2 messages
      assert.ok(!prompt.includes('Message 1'), 'Should not include oldest message')
      assert.ok(prompt.includes('Response 2'), 'Should include recent messages')
      assert.ok(prompt.includes('Message 3'), 'Should include most recent message')
    })

    await t.test('includes target artifact hint when specified', () => {
      const builder = createPromptBuilder()
      const input = createInput('Help me with personas', { targetArtifact: 'persona' })
      const prompt = builder.buildUserPrompt(input)

      assert.ok(prompt.includes('## Target Artifact Hint'), 'Should have target hint section')
      assert.ok(prompt.includes('persona'), 'Should include target artifact type')
    })

    await t.test('includes planning instructions', () => {
      const builder = createPromptBuilder()
      const input = createInput('Create a PRD')
      const prompt = builder.buildUserPrompt(input)

      assert.ok(prompt.includes('## Instructions'), 'Should have instructions section')
      assert.ok(
        prompt.includes('Analyze the user\'s request'),
        'Should include analysis instruction'
      )
      assert.ok(
        prompt.includes('execution plan'),
        'Should mention creating execution plan'
      )
    })
  })

  await t.test('buildRefinementPrompt', async (t) => {
    await t.test('includes current plan', () => {
      const builder = createPromptBuilder()
      const originalInput = createInput('Create a PRD')
      const currentPlan = JSON.stringify({
        targetArtifact: 'prd',
        steps: [{ id: 'step-1', toolId: 'prd.analyze-context' }]
      })

      const prompt = builder.buildRefinementPrompt(
        originalInput,
        currentPlan,
        'Add research step first'
      )

      assert.ok(prompt.includes('## Current Plan'), 'Should have current plan section')
      assert.ok(prompt.includes('prd.analyze-context'), 'Should include plan content')
    })

    await t.test('includes user feedback', () => {
      const builder = createPromptBuilder()
      const originalInput = createInput('Create a PRD')
      const currentPlan = '{}'
      const feedback = 'Please add more detail to the overview section'

      const prompt = builder.buildRefinementPrompt(originalInput, currentPlan, feedback)

      assert.ok(prompt.includes('## User Feedback'), 'Should have feedback section')
      assert.ok(
        prompt.includes('Please add more detail to the overview section'),
        'Should include feedback content'
      )
    })

    await t.test('includes original request', () => {
      const builder = createPromptBuilder()
      const originalInput = createInput('Create a PRD for a payment app')
      const currentPlan = '{}'

      const prompt = builder.buildRefinementPrompt(
        originalInput,
        currentPlan,
        'Some feedback'
      )

      assert.ok(prompt.includes('## Original Request'), 'Should have original request section')
      assert.ok(
        prompt.includes('Create a PRD for a payment app'),
        'Should include original message'
      )
    })

    await t.test('includes refinement instructions', () => {
      const builder = createPromptBuilder()
      const originalInput = createInput('Create a PRD')
      const currentPlan = '{}'

      const prompt = builder.buildRefinementPrompt(
        originalInput,
        currentPlan,
        'Add more steps'
      )

      assert.ok(prompt.includes('## Instructions'), 'Should have instructions section')
      assert.ok(
        prompt.includes('additional context') || prompt.includes('revised plan'),
        'Should mention treating feedback as additional context or revising the plan'
      )
      assert.ok(
        prompt.includes('re-apply the planning rules'),
        'Should instruct to re-apply planning rules with new context'
      )
    })
  })

  await t.test('factory function', async (t) => {
    await t.test('creates builder with default config', () => {
      const builder = createPromptBuilder()
      assert.ok(builder instanceof PromptBuilder)

      // Default config should include examples
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)
      assert.ok(prompt.includes('## Example Plans'))
    })

    await t.test('creates builder with custom config', () => {
      const builder = createPromptBuilder({
        includeExamples: false,
        maxHistoryMessages: 3,
        groupToolsByType: false
      })
      assert.ok(builder instanceof PromptBuilder)

      // Should respect custom config
      const prompt = builder.buildSystemPrompt(MOCK_TOOLS)
      assert.ok(!prompt.includes('## Example Plans'))
    })
  })
})
