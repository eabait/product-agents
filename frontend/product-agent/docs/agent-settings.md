# Enhanced Agent Settings with OpenRouter Integration

## Overview

The PRD Agent frontend now features an enhanced settings system that dynamically fetches AI models from OpenRouter API, displaying rich model information including costs, context sizes, and performance indicators.

## Key Features

### 1. Dynamic Model Fetching
- **API Integration**: Connects to OpenRouter API (`https://openrouter.ai/api/v1/models`)
- **Real-time Data**: Gets latest model availability and pricing
- **Fallback Models**: Uses hardcoded models if API is unavailable
- **Caching**: Implements client-side caching for performance

### 2. Rich Model Information Display
Each model shows:
- **Model Name**: Human-readable name (e.g., "Claude 3.5 Sonnet")
- **Provider**: Model provider (Anthropic, OpenAI, Meta, etc.)
- **Context Length**: Maximum context window (e.g., "200K context")
- **Pricing**: Cost per 1M tokens for prompt/completion (e.g., "$3.00/$15.00 per 1M")
- **Quality Indicators**:
  - ⭐ **Top Provider**: Indicates best-performing provider
  - 🛡️ **Safe**: Content moderation enabled
- **Description**: Brief model description and use case

### 3. Enhanced User Experience
- **Loading States**: Shows spinner while fetching models
- **Error Handling**: Retry button and graceful fallbacks
- **Search/Filter**: Easy model discovery
- **Responsive Design**: Works on all screen sizes
- **Auto-save**: Settings persist automatically

## API Integration

### OpenRouter Models Endpoint
```typescript
GET /api/models
Headers:
  - Content-Type: application/json
  - x-api-key: [OpenRouter API Key] (optional)
```

### Response Format
```typescript
{
  models: EnhancedModel[];
  count: number;
  cached: boolean;
  timestamp: string;
}
```

### Model Data Structure
```typescript
interface EnhancedModel {
  id: string;                    // "anthropic/claude-3-5-sonnet"
  name: string;                  // "Claude 3.5 Sonnet"
  description?: string;          // Model description
  contextLength: number;         // 200000
  pricing: {
    prompt: number;              // 3.0 (per 1M tokens)
    completion: number;          // 15.0 (per 1M tokens)
    promptFormatted: string;     // "$3.00"
    completionFormatted: string; // "$15.00"
  };
  isTopProvider: boolean;        // Quality indicator
  maxCompletionTokens?: number;  // Optional limit
  isModerated: boolean;          // Safety indicator
  provider: string;              // "anthropic"
}
```

## Configuration

### Environment Variables
```env
OPENROUTER_API_KEY=sk-or-v1-...  # Optional, can be set in UI
YOUR_SITE_URL=https://your-app.com
YOUR_SITE_NAME=PRD Agent
```

### LocalStorage Keys
- `prd-agent-settings`: Main settings (model, temperature, tokens, API key)
- Models data is cached temporarily for performance

## Usage

### For Users
1. **Open Settings**: Click Settings button in header
2. **View Models**: See dynamic model list with pricing and specs
3. **Select Model**: Choose based on cost, speed, and capabilities
4. **API Key**: Optionally add OpenRouter API key for more models
5. **Auto-save**: Settings save automatically

### For Developers
```typescript
// Fetch models manually
const fetchModels = async () => {
  const response = await fetch("/api/models");
  const data = await response.json();
  return data.models;
};

// Access current settings
const settings = {
  model: "anthropic/claude-3-5-sonnet",
  temperature: 0.7,
  maxTokens: 4096,
  apiKey: "sk-or-v1-..."
};
```

## Error Handling

### API Failures
- **Fallback Models**: Uses predefined model list if API fails
- **Retry Functionality**: Users can retry failed requests
- **Error Messages**: Clear feedback about issues
- **Graceful Degradation**: App continues working with fallbacks

### Model Selection
- **Validation**: Ensures selected model exists
- **Default Selection**: Falls back to Claude 3.5 Sonnet
- **Loading States**: Prevents interaction during fetch

## Performance Optimizations

### Caching Strategy
- **Client-side Caching**: Reduces API calls
- **TTL-based Refresh**: Updates when data is stale
- **Conditional Fetching**: Only fetches when needed

### UI Optimizations
- **Virtualized Lists**: Handles large model lists efficiently
- **Lazy Loading**: Models load when settings opened
- **Debounced Requests**: Prevents spam requests

## Future Enhancements

### Multi-Agent Support
The architecture supports different models for different agent types:
- **Main Agent**: Overall PRD generation
- **Research Agent**: Market research and analysis  
- **Content Agent**: Writing and formatting
- **Review Agent**: Quality assurance

### Advanced Features
- **Model Comparison**: Side-by-side model comparisons
- **Usage Analytics**: Track model performance and costs
- **Recommendations**: Suggest optimal models for tasks
- **Batch Operations**: Configure multiple agents at once

## Migration Notes

### From Static Models
The system automatically migrates from hardcoded models to dynamic OpenRouter models while maintaining backward compatibility.

### Settings Preservation
Existing user settings are preserved during the upgrade, with new features becoming available immediately.