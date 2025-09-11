import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject, generateText, streamText } from 'ai'
import { z } from 'zod'

export class OpenRouterClient {
  private provider: any
  
  constructor(apiKey?: string) {
    this.provider = createOpenRouter({
      apiKey: apiKey || process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1'
    })
  }
  
  getModel(modelName: string = 'anthropic/claude-3-5-sonnet') {
    return this.provider(modelName)
  }
  
  async generateStructured<T>(params: {
    model: string
    schema: z.ZodSchema<T>
    prompt: string
    temperature?: number
    maxTokens?: number
    arrayFields?: string[] // Optional array fields for post-processing fallback
  }): Promise<T> {
    try {
      const { object } = await generateObject({
        model: this.getModel(params.model),
        schema: params.schema,
        prompt: params.prompt,
        temperature: params.temperature || 0.3,
        maxTokens: params.maxTokens || 8000
      })
      
      return object
    } catch (error: any) {
      // Enhanced fallback handling for various response malformation issues
      const shouldAttemptFallback = error.message?.includes('validation') || 
                                   error.message?.includes('Expected array') ||
                                   error.message?.includes('Required') ||
                                   error.message?.includes('Invalid') ||
                                   error.message?.includes('parse')
      
      if (shouldAttemptFallback) {
        console.warn('Schema validation failed, attempting enhanced fallback...', error.message)
        
        try {
          // Generate without schema validation to get raw response
          const { text } = await generateText({
            model: this.getModel(params.model),
            prompt: params.prompt + '\n\nCRITICAL: Return ONLY valid JSON. No XML tags, parameter names, or additional text.',
            temperature: params.temperature || 0.3,
            maxTokens: params.maxTokens || 8000
          })
          
          // Apply comprehensive response preprocessing
          const sanitizedJson = this.sanitizeResponse(text)
          const rawObject = JSON.parse(sanitizedJson)
          
          // Apply post-processing for array fields if specified
          const processedObject = params.arrayFields && params.arrayFields.length > 0 
            ? this.ensureArrayFields(rawObject, params.arrayFields)
            : rawObject
          
          // Validate the processed object
          const validatedObject = params.schema.parse(processedObject)
          
          console.log('Enhanced fallback preprocessing succeeded')
          return validatedObject
        } catch (fallbackError) {
          console.error('Enhanced fallback failed:', fallbackError)
          console.error('Original error:', error)
          throw error // Re-throw original error if fallback fails
        }
      }
      
      throw error
    }
  }

  /**
   * Sanitizes malformed AI responses that contain XML-like parameter tags mixed with JSON
   * Handles patterns like: {"field": "value", <parameter name="field2">value2</parameter>}
   */
  private sanitizeResponse(responseText: string): string {
    try {
      // First, try to parse as-is (fast path for well-formed JSON)
      JSON.parse(responseText.trim())
      return responseText.trim()
    } catch {
      // Response needs sanitization
    }

    let sanitized = responseText.trim()
    
    // Remove backticks and markdown code block markers
    sanitized = sanitized.replace(/^```json\s*/g, '').replace(/```\s*$/g, '')
    sanitized = sanitized.replace(/^```\s*/g, '').replace(/```\s*$/g, '')
    
    // Remove any text before the first { or [
    const jsonStart = sanitized.search(/^[\s]*[{[]/)
    if (jsonStart > 0) {
      sanitized = sanitized.substring(jsonStart)
    }
    
    // Remove any text after the last } or ]
    const jsonEnd = sanitized.lastIndexOf(sanitized.startsWith('[') ? ']' : '}')
    if (jsonEnd !== -1 && jsonEnd < sanitized.length - 1) {
      sanitized = sanitized.substring(0, jsonEnd + 1)
    }

    // Enhanced XML parameter extraction - handle multiple patterns
    console.log('Raw response before XML parameter extraction:', sanitized.substring(0, 200));

    // Pattern 1: Handle XML-like parameter tags with proper closing: <parameter name="fieldName">value</parameter>
    sanitized = sanitized.replace(
      /<parameter\s+name="([^"]+)"[^>]*>(.*?)<\/parameter>/gs,
      (match, fieldName, value) => {
        console.log(`Found closed XML parameter: ${fieldName}, value length: ${value.length}`);
        try {
          // Test if value is valid JSON
          JSON.parse(value.trim())
          return `"${fieldName}": ${value.trim()}`
        } catch {
          return `"${fieldName}": "${value.replace(/"/g, '\\"').trim()}"`
        }
      }
    )

    // Pattern 2: Handle unclosed XML parameter tags that extend to end of object/array or next field
    // This is the key pattern for our issue: <parameter name="fieldName">[JSON content]
    sanitized = sanitized.replace(
      /,\s*<parameter\s+name="([^"]+)"[^>]*>(\[[\s\S]*?\])/g,
      (match, fieldName, value) => {
        console.log(`Found unclosed XML parameter with array: ${fieldName}, value length: ${value.length}`);
        try {
          // Validate that it's a proper JSON array
          JSON.parse(value.trim())
          return `, "${fieldName}": ${value.trim()}`
        } catch (e) {
          console.warn(`Failed to parse array value for ${fieldName}:`, e);
          return `, "${fieldName}": []`
        }
      }
    )

    // Pattern 3: Handle unclosed XML parameter tags that extend to end of object/array or next field
    // Alternative pattern: <parameter name="fieldName">JSON_OBJECT
    sanitized = sanitized.replace(
      /,\s*<parameter\s+name="([^"]+)"[^>]*>(\{[\s\S]*?\})/g,
      (match, fieldName, value) => {
        console.log(`Found unclosed XML parameter with object: ${fieldName}, value length: ${value.length}`);
        try {
          // Validate that it's a proper JSON object
          JSON.parse(value.trim())
          return `, "${fieldName}": ${value.trim()}`
        } catch (e) {
          console.warn(`Failed to parse object value for ${fieldName}:`, e);
          return `, "${fieldName}": {}`
        }
      }
    )

    // Pattern 4: Handle unclosed XML parameter at start of response
    sanitized = sanitized.replace(
      /^(\s*\{[^}]*),?\s*<parameter\s+name="([^"]+)"[^>]*>(\[[\s\S]*?\])/,
      (match, prefix, fieldName, value) => {
        console.log(`Found leading XML parameter with array: ${fieldName}, value length: ${value.length}`);
        try {
          JSON.parse(value.trim())
          return `${prefix}, "${fieldName}": ${value.trim()}`
        } catch (e) {
          console.warn(`Failed to parse leading array value for ${fieldName}:`, e);
          return `${prefix}, "${fieldName}": []`
        }
      }
    )

    // Pattern 5: Handle simple unclosed parameter tags: <parameter name="fieldName">simple_value
    sanitized = sanitized.replace(
      /<parameter\s+name="([^"]+)"[^>]*>([^<]*?)(?=\s*[,}\]\s]|$)/g,
      (match, fieldName, value) => {
        console.log(`Found simple XML parameter: ${fieldName}, value: ${value.trim()}`);
        try {
          JSON.parse(value.trim())
          return `"${fieldName}": ${value.trim()}`
        } catch {
          return `"${fieldName}": "${value.replace(/"/g, '\\"').trim()}"`
        }
      }
    )

    // Pattern 6: Handle standalone parameter tags: <parameter name="fieldName"/>
    sanitized = sanitized.replace(
      /<parameter\s+name="([^"]+)"\s*\/>/g,
      (match, fieldName) => {
        console.log(`Found standalone XML parameter: ${fieldName}`);
        return `"${fieldName}": null`
      }
    )

    console.log('After XML parameter extraction:', sanitized.substring(0, 200));

    // Clean up any remaining XML artifacts before fixing commas
    sanitized = sanitized.replace(/<[^>]+>/g, '')

    // Fix missing commas between JSON fields - be more careful about this
    // Only add commas if there isn't already one
    sanitized = sanitized.replace(/([}\]])(\s*)("([^"]+)":)/g, (match, closer, whitespace, fieldPart, fieldName) => {
      return `${closer},${whitespace}${fieldPart}`
    })
    
    // Fix cases where we have a value followed by a field without comma
    sanitized = sanitized.replace(/(:\s*"[^"]*")(\s*)("([^"]+)":)/g, '$1,$2$3')
    sanitized = sanitized.replace(/(:\s*\[[^\]]*\])(\s*)("([^"]+)":)/g, '$1,$2$3')
    sanitized = sanitized.replace(/(:\s*\{[^}]*\})(\s*)("([^"]+)":)/g, '$1,$2$3')

    console.log('After comma fixes:', sanitized.substring(0, 200));
    
    // Fix trailing commas
    sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1')
    
    // Validate the sanitized JSON
    try {
      JSON.parse(sanitized)
      console.log('Response sanitization successful')
      return sanitized
    } catch (parseError) {
      console.error('Failed to sanitize malformed response:', parseError)
      console.error('Original response:', responseText)
      console.error('Sanitized attempt:', sanitized)
      throw new Error(`Unable to sanitize malformed AI response: ${parseError}`)
    }
  }

  private ensureArrayFields(obj: any, arrayFields: string[]): any {
    if (!obj || typeof obj !== 'object') return obj
    
    const processedObj = { ...obj }
    
    function processObject(target: any, path: string = ''): any {
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        return target
      }
      
      const result: any = {}
      
      for (const [key, value] of Object.entries(target)) {
        const currentPath = path ? `${path}.${key}` : key
        
        if (arrayFields.includes(currentPath)) {
          if (typeof value === 'string') {
            try {
              result[key] = JSON.parse(value)
            } catch {
              console.warn(`Failed to parse JSON string for field ${currentPath}, using empty array`)
              result[key] = []
            }
          } else if (!Array.isArray(value)) {
            result[key] = []
          } else {
            result[key] = value
          }
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          result[key] = processObject(value, currentPath)
        } else {
          result[key] = value
        }
      }
      
      return result
    }
    
    return processObject(processedObj)
  }
  
  async generateText(params: {
    model: string
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    const { text } = await generateText({
      model: this.getModel(params.model),
      prompt: params.prompt,
      temperature: params.temperature || 0.7,
      maxTokens: params.maxTokens || 2000
    })
    
    return text
  }
  
  async *streamText(params: {
    model: string
    prompt: string
    temperature?: number
  }) {
    const { textStream } = await streamText({
      model: this.getModel(params.model),
      prompt: params.prompt,
      temperature: params.temperature || 0.7
    })
    
    for await (const chunk of textStream) {
      yield chunk
    }
  }
}

export * from 'zod'
