/**
 * Ensures that specified fields are arrays, converting from JSON strings if necessary
 * and initializing empty arrays for missing or invalid fields.
 */
export function ensureArrayFields<T>(response: unknown, arrayFields: string[]): T {
  const processedResponse = { ...(response as Record<string, unknown>) }

  function ensureArraysInObject(obj: unknown, path = ''): unknown {
    if (obj === null || obj === undefined) {
      return obj
    }

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      const processedObj: Record<string, unknown> = {}

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
