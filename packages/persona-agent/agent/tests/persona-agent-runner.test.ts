import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PersonaAgentRunner,
  buildPersonaPrompt,
  type PersonaAgentRunnerInput
} from '../src/persona-agent-runner'
import type { GenerationUsage } from '@product-agents/agent-core'

type StructuredResponse = {
  personas: unknown
  notes?: unknown
  rationale?: string
}

class MockOpenRouterClient {
  public lastPrompt?: string

  constructor(
    private readonly options: {
      response?: StructuredResponse
      throwError?: boolean
      usage?: GenerationUsage
    }
  ) {}

  async generateStructured(params: { prompt: string }): Promise<StructuredResponse> {
    this.lastPrompt = params.prompt
    if (this.options.throwError) {
      throw new Error('mock-llm-error')
    }
    const response = this.options.response ?? { personas: [] }
    const personasValue =
      typeof response.personas === 'string'
        ? JSON.parse(response.personas)
        : response.personas
    const notesValue =
      typeof response.notes === 'string'
        ? [response.notes]
        : response.notes

    return {
      ...response,
      personas: personasValue,
      notes: notesValue
    } as StructuredResponse
  }

  getLastUsage(): GenerationUsage | undefined {
    return this.options.usage
  }
}

const baseInput: PersonaAgentRunnerInput = {
  model: 'anthropic/claude-test',
  temperature: 0.2,
  maxOutputTokens: 2000,
  targetUsers: ['Ops lead balancing releases'],
  keyFeatures: ['Weekly persona digest'],
  constraints: ['Regulatory approvals'],
  successMetrics: ['Persona adoption'],
  requestMessage: 'Draft persona insights from the latest PRD context.'
}

test('buildPersonaPrompt weaves context fields into the template', () => {
  const prompt = buildPersonaPrompt({
    ...baseInput,
    additionalNotes: ['Note A'],
    params: {
      description: 'High level summary'
    }
  })

  assert.match(prompt, /Target users/i)
  assert.match(prompt, /Ops lead balancing releases/)
  assert.match(prompt, /High level summary/)
  assert.match(prompt, /Note A/)
})

test('persona runner normalizes string persona payloads and records telemetry', async () => {
  const mockClient = new MockOpenRouterClient({
    response: {
      personas: JSON.stringify([
        {
          name: 'Busy Builder',
          summary: 'Builds features with tight schedules.',
          goals: ['Ship faster'],
          frustrations: ['Slow reviews'],
          opportunities: ['Automation'],
          successIndicators: ['Cycle time']
        }
      ]),
      notes: 'Sample note'
    },
    usage: {
      model: 'anthropic/claude-test',
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      totalCost: 0.01
    }
  })

  const runner = new PersonaAgentRunner({ client: mockClient as any })
  const result = await runner.run(baseInput)

  assert.equal(result.strategy, 'llm')
  assert.equal(result.personas.length, 1)
  assert.equal(result.personas[0].id, 'persona-1')
  assert.ok(result.notes && result.notes[0].includes('Sample note'))
  assert.ok(result.telemetry)
  assert.equal(result.telemetry?.strategy, 'llm')
  assert.ok((result.telemetry?.promptLength ?? 0) > 0)
  assert.match(result.telemetry?.responsePreview ?? '', /Busy Builder/)
})

test('persona runner falls back to heuristic personas and captures error telemetry', async () => {
  const mockClient = new MockOpenRouterClient({ throwError: true })
  const runner = new PersonaAgentRunner({ client: mockClient as any })
  const result = await runner.run(baseInput)

  assert.equal(result.strategy, 'heuristic')
  assert.ok(result.personas.length > 0)
  assert.equal(result.telemetry?.strategy, 'heuristic')
  assert.ok(result.telemetry?.errorMessage?.includes('mock-llm-error'))
})
