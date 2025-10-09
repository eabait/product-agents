import { NextRequest, NextResponse } from "next/server";
import { ModelCapability, mapOpenRouterToAgentCapabilities } from "@product-agents/model-compatibility";

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
    tokenizer: string;
    instruct_type?: string;
  };
  pricing: {
    prompt: string;
    completion: string;
    request?: string;
    image?: string;
  };
  top_provider?: {
    context_length: number;
    max_completion_tokens: number;
    is_moderated: boolean;
  };
  per_request_limits?: {
    prompt_tokens: string;
    completion_tokens: string;
  };
  // OpenRouter supported parameters (what capabilities the model supports)
  supported_parameters?: string[];
}

type AgentCapabilityProfile = {
  agent: ModelCapability[]
  subAgents: Record<string, ModelCapability[]>
}

const DEFAULT_CAPABILITIES: ModelCapability[] = ['structured_output']

// Helper function to fetch agent capabilities
async function fetchAgentCapabilities(): Promise<AgentCapabilityProfile> {
  try {
    const agentUrl = process.env.PRD_AGENT_URL || "http://localhost:3001";
    const response = await fetch(`${agentUrl}/health`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const agentCapabilities: ModelCapability[] =
        data.metadata?.requiredCapabilities ||
        data.agentInfo?.requiredCapabilities ||
        DEFAULT_CAPABILITIES;

      const subAgentCapabilities: Record<string, ModelCapability[]> = {};
      if (Array.isArray(data.metadata?.subAgents)) {
        for (const subAgent of data.metadata.subAgents) {
          if (subAgent?.id) {
            subAgentCapabilities[subAgent.id] = Array.isArray(subAgent.requiredCapabilities)
              ? subAgent.requiredCapabilities
              : [];
          }
        }
      }

      return {
        agent: agentCapabilities,
        subAgents: subAgentCapabilities
      };
    }
  } catch (error) {
    console.warn('Failed to fetch agent capabilities:', error);
  }
  
  // Fallback to legacy behavior (structured_output only)
  return {
    agent: DEFAULT_CAPABILITIES,
    subAgents: {}
  };
}

// Check if a model meets agent requirements
function doesModelMeetRequirements(model: OpenRouterModel, requiredCapabilities: ModelCapability[]): boolean {
  const modelCapabilities = mapOpenRouterToAgentCapabilities(model);
  const meetsRequirements = requiredCapabilities.every(required => modelCapabilities.includes(required));
  
  // Debug logging for models that don't meet requirements
  if (!meetsRequirements) {
    const missing = requiredCapabilities.filter(req => !modelCapabilities.includes(req));
    console.log(`Model ${model.id} missing capabilities:`, missing, 'Has:', modelCapabilities, 'Needs:', requiredCapabilities);
  }
  
  return meetsRequirements;
}

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || request.headers.get('x-api-key');
    
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenRouter API key is required" }, 
        { status: 400 }
      );
    }
    
    // Fetch agent capabilities to filter models accordingly
    const capabilityProfile = await fetchAgentCapabilities();
    const aggregatedCapabilities = Array.from(
      new Set([
        ...capabilityProfile.agent,
        ...Object.values(capabilityProfile.subAgents).flat()
      ])
    );
    console.log('Agent required capabilities:', aggregatedCapabilities);

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.YOUR_SITE_URL || "",
        "X-Title": process.env.YOUR_SITE_NAME || "PRD Agent",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const models = data.data;

    console.log("Fetched models from OpenRouter:", models.length, "models found");
    console.log("Required capabilities:", aggregatedCapabilities);
    
    // Filter and enhance model data for frontend use
    const enhancedModels = models
      .filter(model => {
        const meetsRequirements = doesModelMeetRequirements(model, aggregatedCapabilities);
        if (!meetsRequirements) {
          const capabilities = mapOpenRouterToAgentCapabilities(model);
          console.log(`Filtering out ${model.id}: has [${capabilities.join(', ')}], needs [${aggregatedCapabilities.join(', ')}]`);
        }
        return meetsRequirements;
      }) // Filter by agent capabilities using OpenRouter data
      .map(model => {
        const capabilities = Array.from(new Set(mapOpenRouterToAgentCapabilities(model)));
        return {
          id: model.id,
          name: model.name,
          description: model.description,
          contextLength: model.context_length,
          pricing: {
            prompt: parseFloat(model.pricing.prompt) * 1000000, // Convert to per 1M tokens
            completion: parseFloat(model.pricing.completion) * 1000000, // Convert to per 1M tokens
            promptFormatted: `$${(parseFloat(model.pricing.prompt) * 1000000).toFixed(2)}`,
            completionFormatted: `$${(parseFloat(model.pricing.completion) * 1000000).toFixed(2)}`,
          },
          isTopProvider: !!model.top_provider,
          maxCompletionTokens: model.top_provider?.max_completion_tokens,
          isModerated: model.top_provider?.is_moderated || false,
          provider: model.id.split('/')[0], // Extract provider from model ID
          toolSupport: capabilities.includes('tools'),
          capabilities
        }
      })
      .sort((a, b) => {
        // Sort by: top providers first, then by price (cheaper first)
        if (a.isTopProvider && !b.isTopProvider) return -1;
        if (!a.isTopProvider && b.isTopProvider) return 1;
        return a.pricing.prompt - b.pricing.prompt;
      });

    const providerBestModel = new Map<string, typeof enhancedModels[number]>();
    for (const model of enhancedModels) {
      const current = providerBestModel.get(model.provider);
      if (!current || model.pricing.prompt < current.pricing.prompt) {
        providerBestModel.set(model.provider, model);
      }
    }

    const MAX_RECOMMENDED_PROVIDERS = 8;
    const recommendedModels = Array.from(providerBestModel.values())
      .sort((a, b) => a.pricing.prompt - b.pricing.prompt)
      .slice(0, MAX_RECOMMENDED_PROVIDERS);
    const recommendedIds = new Set(recommendedModels.map(model => model.id));

    const prioritizedModels = [
      ...recommendedModels,
      ...enhancedModels.filter(model => !recommendedIds.has(model.id))
    ];

    const modelsWithRecommendation = prioritizedModels.map(model => ({
      ...model,
      isRecommended: recommendedIds.has(model.id),
      recommendedReason: recommendedIds.has(model.id)
        ? `Best ${model.provider} option for agent capabilities`
        : undefined
    }));

    console.log(
      `Filtered to ${modelsWithRecommendation.length} models that meet requirements:`,
      modelsWithRecommendation.map(m => `${m.id}${m.isRecommended ? ' (recommended)' : ''}`)
    );

    return NextResponse.json({
      models: modelsWithRecommendation,
      count: modelsWithRecommendation.length,
      capabilityProfile: {
        agent: capabilityProfile.agent,
        subAgents: capabilityProfile.subAgents,
        aggregated: aggregatedCapabilities
      },
      cached: false,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Error fetching models from OpenRouter:", error);
    
    return NextResponse.json(
      { 
        error: "Failed to fetch models from OpenRouter",
        details: error instanceof Error ? error.message : "Unknown error"
      }, 
      { status: 500 }
    );
  }
}
