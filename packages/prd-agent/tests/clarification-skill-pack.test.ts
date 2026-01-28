import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clarificationSkillPack,
  listClarificationSkills
} from '@product-agents/skills-clarifications'

test('clarificationSkillPack exposes clarification analyzer skill', () => {
  assert.equal(clarificationSkillPack.id, 'clarification.core')
  assert.equal(clarificationSkillPack.skills.length, 1)
  const [skill] = clarificationSkillPack.skills
  assert.equal(skill.id, 'clarification.check')
  assert.equal(skill.category, 'analyzer')
})

test('listClarificationSkills returns a defensive copy', () => {
  const skills = listClarificationSkills()
  skills.push({
    ...skills[0],
    id: 'temp'
  })

  assert.equal(listClarificationSkills().length, clarificationSkillPack.skills.length)
})
