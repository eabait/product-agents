# Persona Subagent API Surface

The persona builder is exposed via the thin API to allow the frontend and SDK callers to derive personas from an existing PRD artifact without re-running the full orchestration pipeline.

## Endpoint

```
POST /api/subagents/persona
```

### Payload

```json
{
  "runId": "optional-prd-run-id",
  "artifact": {
    "data": { "sections": { "targetUsers": { "targetUsers": [] } } }
  },
  "overrides": {
    "model": "anthropic/claude-3-5-sonnet",
    "temperature": 0.2,
    "maxOutputTokens": 8000
  }
}
```

- `runId` (optional) ties persona output back to a prior PRD run stored in the in-memory run store so UI refreshes can surface cached persona artifacts.
- `artifact` (required when the thin API cannot recover the PRD artifact from a prior run) accepts the raw PRD payload. The helper on the frontend serialises the latest assistant message into this format automatically.
- `overrides` is mapped onto `resolveRunSettings` so a caller can pin a specific model/temperature for persona synthesis.

### Response

```json
{
  "subagentId": "persona.builder",
  "artifact": {
    "id": "artifact-...",
    "kind": "persona",
    "label": "Persona Bundle",
    "data": {
      "personas": [
        {
          "id": "persona-1",
          "name": "Primary Persona",
          "summary": "...",
          "goals": ["..."],
          "frustrations": ["..."],
          "opportunities": ["..."],
          "successIndicators": ["..."],
          "quote": "...",
          "tags": ["persona", "primary"]
        }
      ],
      "source": {
        "artifactId": "artifact-prd-run",
        "artifactKind": "prd",
        "runId": "run-id",
        "sectionsUsed": ["targetUsers", "keyFeatures", "constraints", "successMetrics"]
      },
      "generatedAt": "2024-09-18T00:00:00.000Z"
    },
    "metadata": {
      "createdAt": "2024-09-18T00:00:00.000Z",
      "createdBy": "persona-subagent",
      "tags": ["persona", "derived"],
      "extras": {
        "sourceArtifactId": "artifact-prd-run",
        "personaCount": 3,
        "sectionsUsed": ["targetUsers", "keyFeatures", "constraints", "successMetrics"],
        "sourceArtifactKind": "prd"
      }
    }
  },
  "metadata": {
    "personaCount": 3,
    "sectionsUsed": ["targetUsers", "keyFeatures", "constraints", "successMetrics"],
    "sourceArtifactId": "artifact-prd-run"
  }
}
```

Consumers can safely JSON stringify the `artifact.data` block to persist personas or display them in the UI. The extras field lists which PRD sections the persona builder referenced.

### Error Conditions

- `404` — no artifact available. Pass the PRD payload explicitly when replaying offline conversations.
- `500` — persona builder threw, typically because the PRD artifact was incomplete. The frontend propagates the error as an assistant message.

### Caching

When a `runId` is supplied the thin API caches the generated persona artifact in the run store (`run.subagentArtifacts["persona.builder"]`). Subsequent persona requests for the same run reuse the cached artifact.
