import test from 'node:test'
import assert from 'node:assert/strict'

import { prdSkillPack, listPrdSkills } from '@product-agents/skills-prd'
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
