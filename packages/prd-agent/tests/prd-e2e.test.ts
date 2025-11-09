import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createPrdController } from '../src/compositions/prd-controller'
import { loadProductAgentConfig } from '@product-agents/product-agent'

const shouldRunE2E = process.env.RUN_PRODUCT_AGENT_E2E === 'true'
const prompt =
  [
    'Create a product requirements document for a mobile budgeting assistant',
    'targeting US-based millennials with disposable income but poor savings habits.',
    'Include goals, target users, key features, success metrics, and delivery constraints.'
  ].join(' ')

  // ,
  //   'targeting US-based millennials with disposable income but poor savings habits.',
  //   'Include goals, target users, key features, success metrics, and delivery constraints.'

const e2eTest = shouldRunE2E ? test : test.skip

e2eTest(
  'product-agent generates a PRD via live orchestrator call',
  { timeout: 180_000 },
  async () => {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY must be set to run the PRD E2E test')
    }

    const config = loadProductAgentConfig()
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-e2e-'))

    const controller = createPrdController({
      config,
      workspaceRoot,
      clock: () => new Date()
    })

    try {
      console.log('[prd-e2e] sending prompt:', prompt)
      const summary = await controller.start(
        {
          request: {
            artifactKind: 'prd',
            input: {
              message: prompt,
              context: {},
              settings: {
                model: config.runtime.defaultModel,
                temperature: config.runtime.defaultTemperature,
                maxTokens: config.runtime.maxOutputTokens
              }
            },
            createdBy: 'prd-e2e-test'
          }
        },
        {
          emit(event) {
            if (event.type === 'step.started' && event.stepId === 'legacy-prd-run') {
              console.log('[prd-e2e][clarification] checking prompts via legacy orchestrator')
            }

            console.log('[prd-e2e][progress]', event.type, event.status ?? '', event.message ?? '')
          }
        }
      )

      console.log('[prd-e2e] run status:', summary.status)
      if (summary.metadata && 'plan' in summary.metadata) {
        console.log('[prd-e2e] plan graph:\n', JSON.stringify((summary.metadata as any).plan, null, 2))
      }

      if (summary.artifact) {
        console.log('[prd-e2e] artifact payload:\n', JSON.stringify(summary.artifact, null, 2))
      } else {
        console.warn('[prd-e2e] no artifact returned – check orchestrator response or prompt quality')
      }

      const clarificationEvents = summary.skillResults
        .map(result => (result.metadata as Record<string, unknown> | undefined)?.clarification)
        .filter(Boolean)
      if (clarificationEvents.length === 0) {
        console.log('[prd-e2e][clarification] no additional questions required for this prompt')
      } else {
        console.log('[prd-e2e][clarification] details:', JSON.stringify(clarificationEvents, null, 2))
      }

      assert.notEqual(summary.status, 'failed', 'run should not fail')

      if (summary.status === 'awaiting-input') {
        assert.ok(clarificationEvents.length > 0, 'clarification metadata should be present when awaiting input')
        const clarification = clarificationEvents[0] as { needsClarification?: boolean } | undefined
        assert.ok(clarification?.needsClarification === true, 'run awaiting input should request clarification')
      } else {
        assert.equal(summary.status, 'completed', 'non-clarification runs should complete')
        assert.ok(summary.artifact, 'expected a PRD artifact in the summary')
      }
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true })
    }
  }
)
