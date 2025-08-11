import { NextRequest, NextResponse } from "next/server";

interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  architecture: {
    modality: string;
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
    
    // Filter and enhance model data for frontend use
    const enhancedModels = models
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
      }))
      .sort((a, b) => {
        // Sort by: top providers first, then by price (cheaper first)
        if (a.isTopProvider && !b.isTopProvider) return -1;
        if (!a.isTopProvider && b.isTopProvider) return 1;
        return a.pricing.prompt - b.pricing.prompt;
      });

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