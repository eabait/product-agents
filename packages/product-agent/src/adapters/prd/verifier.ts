import type { Verifier, VerificationRequest, VerificationResult, VerificationIssue } from '../../contracts/verifier'
import type { Artifact } from '../../contracts/core'
import type { SectionRoutingResponse } from '@product-agents/prd-agent'

interface PrdVerifierOptions {
  clock?: () => Date
}

type PrdArtifact = Artifact<SectionRoutingResponse>

const REQUIRED_SECTIONS: Array<keyof SectionRoutingResponse['sections']> = [
  'targetUsers',
  'solution',
  'keyFeatures',
  'successMetrics',
  'constraints'
]

const buildIssues = (artifact: PrdArtifact): VerificationIssue[] => {
  const issues: VerificationIssue[] = []
  const sections = artifact.data?.sections ?? {}

  const missingSections = REQUIRED_SECTIONS.filter(section => !sections?.[section])
  if (missingSections.length > 0) {
    issues.push({
      id: 'prd.missing_sections',
      message: `Missing sections: ${missingSections.join(', ')}`,
      severity: 'warning',
      suggestedAction: 'Regenerate the missing sections',
      metadata: {
        missingSections
      }
    })
  }

  if (artifact.data?.validation && !artifact.data.validation.is_valid) {
    issues.push({
      id: 'prd.validation_failed',
      message: 'PRD validation reported issues',
      severity: 'warning',
      suggestedAction: 'Review validation warnings before delivery',
      metadata: {
        issues: artifact.data.validation.issues,
        warnings: artifact.data.validation.warnings
      }
    })
  }

  return issues
}

export class PrdVerifier implements Verifier<SectionRoutingResponse> {
  private readonly clock: () => Date

  constructor(options?: PrdVerifierOptions) {
    this.clock = options?.clock ?? (() => new Date())
  }

  async verify(
    request: VerificationRequest<SectionRoutingResponse>
  ): Promise<VerificationResult<SectionRoutingResponse>> {
    const artifact: PrdArtifact = {
      ...request.artifact,
      metadata: {
        ...(request.artifact.metadata ?? {}),
        createdAt: request.artifact.metadata?.createdAt ?? this.clock().toISOString(),
        updatedAt: this.clock().toISOString()
      }
    }

    const issues = buildIssues(artifact)

    const status: VerificationResult['status'] =
      issues.some(issue => issue.severity === 'error') ? 'fail' : issues.length > 0 ? 'needs-review' : 'pass'

    return {
      status,
      artifact,
      issues,
      metadata: {
        verifiedAt: artifact.metadata?.updatedAt,
        reviewer: 'prd-verifier'
      }
    }
  }
}

export const createPrdVerifier = (options?: PrdVerifierOptions): PrdVerifier =>
  new PrdVerifier(options)
