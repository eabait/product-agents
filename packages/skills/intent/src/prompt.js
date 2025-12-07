export const buildIntentPrompt = (context) => {
  const artifacts = context.availableArtifacts.join(', ')
  const existing = Array.isArray(context.metadata?.existingArtifacts)
    ? context.metadata.existingArtifacts.join(', ')
    : 'none'

  return `
You are part of an intelligent Product Definition Agent. Your job is to infer which artifact(s) to create or update (e.g., PRD, personas, story map) from the user prompt and any artifacts already in context. Propose the smallest deterministic chain that satisfies the request, reusing existing artifacts whenever possible.

Available artifact types: ${artifacts}.
Existing artifacts in context: ${existing}.

User message:
"""
${context.message}
"""

Return ONLY JSON with:
- targetArtifact: final artifact to deliver
- chain: ordered list of artifacts to create (keep it short; include only what is necessary)
- transitions: optional list of {fromArtifact?, toArtifact} pairs that describe how artifacts connect
- requestedSections: optional sections to prioritize for any artifact in the chain (e.g., specific PRD sections, persona fields)
- confidence: 0..1
- probabilities: map of artifact -> probability
- rationale: short reason
- guidance: one friendly sentence if the user should add a single missing detail

Rules:
- If an artifact already exists, reuse it instead of recreating it.
- Only include artifacts you truly need; avoid redundant steps.
- Keep chains deterministic and minimal; never invent artifacts outside the available list.
- If information is insufficient, set confidence < 0.6 and use guidance to ask for the top missing item.

Current timestamp: ${context.timestamp}
`
}
