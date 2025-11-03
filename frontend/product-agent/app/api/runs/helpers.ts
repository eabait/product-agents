import type { StartRunPayload } from './schemas'

const buildConversationContext = (messages: StartRunPayload['messages']): string =>
  messages.map(msg => `${msg.role}: ${msg.content}`).join('\n\n')

export const getExistingPrd = (messages: StartRunPayload['messages']): any => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(messages[index].content)
      if (parsed && typeof parsed.problemStatement === 'string') {
        return parsed
      }
    } catch {
      continue
    }
  }
  return null
}

interface BackendRequestInput {
  payload: StartRunPayload
  streaming: boolean
}

export interface BackendRequestDetails {
  endpoint: string
  body: Record<string, unknown>
  isEdit: boolean
  targetSections?: string[]
}

export const buildBackendRequest = ({ payload, streaming }: BackendRequestInput): BackendRequestDetails => {
  const existingPRD = getExistingPrd(payload.messages)
  const baseBody: Record<string, unknown> = {
    message: buildConversationContext(payload.messages),
    settings: payload.settings,
    contextPayload: payload.contextPayload,
    conversationHistory: payload.messages
  }

  if (existingPRD) {
    baseBody.existingPRD = existingPRD
  }

  const suffix = streaming ? '/stream' : ''
  const targetSections = payload.targetSections ?? []

  if (targetSections.length === 1) {
    return {
      endpoint: `/prd/section/${targetSections[0]}${suffix}`,
      body: baseBody,
      isEdit: Boolean(existingPRD),
      targetSections
    }
  }

  if (targetSections.length > 1) {
    return {
      endpoint: `/prd/sections${suffix}`,
      body: {
        ...baseBody,
        targetSections
      },
      isEdit: Boolean(existingPRD),
      targetSections
    }
  }

  return {
    endpoint: existingPRD ? `/prd/edit${suffix}` : `/prd${suffix}`,
    body: baseBody,
    isEdit: Boolean(existingPRD)
  }
}
