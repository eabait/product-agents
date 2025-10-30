import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { FilesystemWorkspaceDAO } from '../src/workspace/filesystem-workspace-dao'

const fixedClock = () => new Date('2024-02-02T00:00:00.000Z')

test('FilesystemWorkspaceDAO persists artifacts and events', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-dao-'))
  const dao = new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock })
  const runId = 'dao-run'

  try {
    const handle = await dao.ensureWorkspace(runId, 'prd')
    assert.equal(handle.descriptor.runId, runId)

    const artifact = {
      id: 'artifact-1',
      kind: 'prd',
      version: '1.0.0',
      data: { sections: {} },
      metadata: { createdAt: fixedClock().toISOString() }
    }

    await dao.writeArtifact(runId, artifact)

    const stored = await dao.readArtifact(runId, artifact.id)
    assert.ok(stored)
    assert.equal(stored?.id, artifact.id)

    const listings = await dao.listArtifacts(runId)
    assert.equal(listings.length, 1)

    await dao.appendEvent(runId, {
      id: 'event-1',
      runId,
      type: 'system',
      createdAt: fixedClock().toISOString(),
      payload: { message: 'artifact stored' }
    })

    const events = await dao.getEvents(runId)
    assert.equal(events.length, 1)
    assert.equal(events[0].payload.message, 'artifact stored')
  } finally {
    await dao.teardown(runId).catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
