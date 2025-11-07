import test from 'node:test'
import assert from 'node:assert/strict'

import { prdSkillPack, listPrdSkills, listPrdSubagents } from '@product-agents/skills-prd'
import { SECTION_NAMES } from '@product-agents/prd-shared'

test('prdSkillPack exposes expected skills', () => {
  assert.equal(prdSkillPack.id, 'prd.core')
  assert.equal(prdSkillPack.skills.length, 8)
  const ids = prdSkillPack.skills.map(skill => skill.id)
  assert.ok(ids.includes('prd.check-clarification'))
  assert.ok(ids.includes('prd.analyze-context'))
  assert.ok(ids.includes('prd.assemble-prd'))
  assert.ok(ids.includes(`prd.write-${SECTION_NAMES.TARGET_USERS}`))
})

test('listPrdSkills produces copy of manifest entries', () => {
  const entries = listPrdSkills()
  assert.equal(entries.length, prdSkillPack.skills.length)
  entries.push({
    id: 'temp',
    label: 'temp',
    version: '1.0.0',
    category: 'analyzer'
  } as any)

  assert.equal(prdSkillPack.skills.length, 8)
})

test('prdSkillPack declares persona subagent', () => {
  assert.ok(Array.isArray(prdSkillPack.subagents))
  const subagents = prdSkillPack.subagents ?? []
  const persona = subagents.find(entry => entry.id === 'persona.builder')
  assert.ok(persona, 'persona.builder subagent should be registered')
  assert.equal(persona?.artifactKind, 'persona')
})

test('listPrdSubagents returns a defensive copy', () => {
  const entries = listPrdSubagents()
  const originalLength = prdSkillPack.subagents?.length ?? 0
  entries.push({
    id: 'temp',
    label: 'Temp',
    version: '0.0.1',
    artifactKind: 'temp'
  })
  assert.equal(prdSkillPack.subagents?.length ?? 0, originalLength)
})
