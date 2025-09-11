/**
 * Post-processes structured responses from AI models to handle cases where
 * array fields are returned as JSON strings instead of proper arrays.
 * 
 * This is a workaround for AI models that sometimes serialize arrays as JSON strings
 * in structured generation, particularly with certain model/provider combinations.
 */

export function postProcessStructuredResponse<T>(response: any, arrayFields: string[]): T {
  const processedResponse = { ...response }

  // Recursively process nested objects
  function processObject(obj: any, path: string = ''): any {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map((item, index) => processObject(item, `${path}[${index}]`))
    }

    if (typeof obj === 'object') {
      const processedObj: any = {}
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key
        
        // Check if this field should be an array but is a string
        if (arrayFields.includes(currentPath) && typeof value === 'string') {
          try {
            processedObj[key] = JSON.parse(value as string)
          } catch (error) {
            console.warn(`Failed to parse JSON string for field ${currentPath}:`, error)
            processedObj[key] = []
          }
        } else if (arrayFields.some(field => field.startsWith(currentPath))) {
          // Recursively process nested objects that contain array fields
          processedObj[key] = processObject(value, currentPath)
        } else {
          processedObj[key] = value
        }
      }
      
      return processedObj
    }

    return obj
  }

  return processObject(processedResponse) as T
}

/**
 * Ensures that specified fields are arrays, converting from JSON strings if necessary
 * and initializing empty arrays for missing or invalid fields.
 */
export function ensureArrayFields<T>(response: any, arrayFields: string[]): T {
  const processedResponse = { ...response }

  function ensureArraysInObject(obj: any, path: string = ''): any {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      const processedObj: any = {}
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key
        
        if (arrayFields.includes(currentPath)) {
          if (typeof value === 'string') {
            try {
              processedObj[key] = JSON.parse(value as string)
            } catch (error) {
              console.warn(`Failed to parse JSON string for array field ${currentPath}:`, error)
              processedObj[key] = []
            }
          } else if (!Array.isArray(value)) {
            processedObj[key] = []
          } else {
            processedObj[key] = value
          }
        } else if (typeof value === 'object') {
          processedObj[key] = ensureArraysInObject(value, currentPath)
        } else {
          processedObj[key] = value
        }
      }
      
      return processedObj
    }

    return obj
  }

  return ensureArraysInObject(processedResponse) as T
}