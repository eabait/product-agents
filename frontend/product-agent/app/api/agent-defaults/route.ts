import { NextResponse } from 'next/server';

const PRD_AGENT_URL = process.env.PRD_AGENT_URL || 'http://localhost:3001';

export async function GET() {
  try {
    console.log('Fetching agent defaults from:', `${PRD_AGENT_URL}/health`);

    const response = await fetch(`${PRD_AGENT_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch agent defaults: ${response.status}`);
    }

    const data = await response.json();
    console.log('Agent defaults received:', data);

    // Extract the default settings from the health endpoint response
    const defaults = {
      model: data.defaultSettings?.model ?? 'anthropic/claude-3-5-sonnet',
      temperature: data.defaultSettings?.temperature ?? 0.2,
      maxTokens: data.defaultSettings?.maxTokens ?? 8000
    };

    const mergedMetadata =
      data.metadata && typeof data.metadata === 'object'
        ? {
            ...data.metadata,
            subAgents: Array.isArray((data.metadata as any).subAgents)
              ? (data.metadata as any).subAgents
              : []
          }
        : {
            subAgents: []
          };

    if (!mergedMetadata.subAgents?.some((agent: any) => agent?.id === 'persona.builder')) {
      mergedMetadata.subAgents = [
        ...(mergedMetadata.subAgents ?? []),
        {
          id: 'persona.builder',
          label: 'Persona Builder',
          artifactKind: 'persona',
          description: 'Transforms PRD context or prompt inputs into structured persona bundles.',
          capabilities: ['analysis', 'synthesis'],
          consumes: ['prd', 'prompt'],
          tags: ['persona', 'derived']
        }
      ]
    }

    return NextResponse.json({
      settings: {
        model: defaults.model,
        temperature: defaults.temperature,
        maxTokens: defaults.maxTokens
      },
      agentInfo: data.agentInfo || null,
      metadata: mergedMetadata
    });

  } catch (error) {
    console.error('Error fetching agent defaults:', error);

    // Return fallback defaults
    return NextResponse.json({
      settings: {
        model: 'anthropic/claude-3-5-sonnet',
        temperature: 0.3,
        maxTokens: 8000
      },
      metadata: {
        subAgents: [
          {
            id: 'persona.builder',
            label: 'Persona Builder',
            artifactKind: 'persona',
            description: 'Transforms PRD context or prompt inputs into structured persona bundles.',
            capabilities: ['analysis', 'synthesis'],
            consumes: ['prd', 'prompt'],
            tags: ['persona', 'derived']
          }
        ]
      },
      agentInfo: null
    });
  }
}
