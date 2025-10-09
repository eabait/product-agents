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

// Helper function to fetch agent capabilities
async function fetchAgentCapabilities(): Promise<ModelCapability[]> {
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
      if (data.metadata?.requiredCapabilities) {
        return data.metadata.requiredCapabilities;
      }
      return data.agentInfo?.requiredCapabilities || ['structured_output']; // fallback to structured_output only
    }
  } catch (error) {
    console.warn('Failed to fetch agent capabilities:', error);
  }
  
  // Fallback to legacy behavior (structured_output only)
  return ['structured_output'];
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
    const requiredCapabilities = await fetchAgentCapabilities();
    console.log('Agent required capabilities:', requiredCapabilities);

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
    console.log("Required capabilities:", requiredCapabilities);
    
    // Filter and enhance model data for frontend use
    const enhancedModels = models
      .filter(model => {
        const meetsRequirements = doesModelMeetRequirements(model, requiredCapabilities);
        if (!meetsRequirements) {
          const capabilities = mapOpenRouterToAgentCapabilities(model);
          console.log(`Filtering out ${model.id}: has [${capabilities.join(', ')}], needs [${requiredCapabilities.join(', ')}]`);
        }
        return meetsRequirements;
      }) // Filter by agent capabilities using OpenRouter data
      .map(model => ({
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
        toolSupport: true, // All filtered models support tools
        capabilities: mapOpenRouterToAgentCapabilities(model) // Show which capabilities this model has from OpenRouter data
      }))
      .sort((a, b) => {
        // Sort by: top providers first, then by price (cheaper first)
        if (a.isTopProvider && !b.isTopProvider) return -1;
        if (!a.isTopProvider && b.isTopProvider) return 1;
        return a.pricing.prompt - b.pricing.prompt;
      });

    console.log(`Filtered to ${enhancedModels.length} models that meet requirements:`, enhancedModels.map(m => m.id));

    return NextResponse.json({
      models: enhancedModels,
      count: enhancedModels.length,
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
