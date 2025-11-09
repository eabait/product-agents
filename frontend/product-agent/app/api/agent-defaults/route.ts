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
    const defaults = data.defaultSettings || {};

    const subAgentSettings = defaults.subAgentSettings
      ? Object.entries(defaults.subAgentSettings).reduce<Record<string, any>>((acc, [key, value]: [string, any]) => {
          acc[key] = { ...value };
          return acc;
        }, {})
      : {};
    
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

    return NextResponse.json({
      settings: {
        model: defaults.model,
        temperature: defaults.temperature,
        maxTokens: defaults.maxTokens,
        subAgentSettings,
      },
      agentInfo: data.agentInfo || null,
      metadata: mergedMetadata
    });

  } catch (error) {
    console.error('Error fetching agent defaults:', error);
    
    // Return fallback defaults instead of undefined
    return NextResponse.json({
      settings: {
        model: 'anthropic/claude-3-5-sonnet',
        temperature: 0.3,
        maxTokens: 8000,
        subAgentSettings: {}
      },
      metadata: null,
      agentInfo: null
    });
  }
}
