import { PRD, PRDPatch, PRDSchema } from './schemas'

// Helper function to clean patch response by removing null values
export function cleanPatchResponse(patch: PRDPatch): PRDPatch {
  const cleanedPatch = { ...patch }
  
  // Remove null values from the patch object
  for (const [key, value] of Object.entries(cleanedPatch.patch)) {
    if (value === null) {
      delete (cleanedPatch.patch as any)[key]
    }
  }
  
  return cleanedPatch
}

// Helper function to apply a patch to a PRD
export function applyPatch(basePRD: PRD, patch: PRDPatch['patch']): PRD {
  const result = { ...basePRD }
  
  for (const [field, operation] of Object.entries(patch)) {
    if (operation === null || operation === undefined) continue
    
    // Handle different field types
    if (typeof operation === 'string') {
      // Simple string replacement
      (result as any)[field] = operation
    } else if (Array.isArray(operation)) {
      // Direct array replacement
      (result as any)[field] = operation
    } else if (typeof operation === 'object' && operation !== null) {
      // Complex operation object
      const op = operation as any
      
      if ('replace' in op) {
        (result as any)[field] = op.replace
      } else if ('add' in op) {
        const currentValue = (result as any)[field]
        if (Array.isArray(currentValue)) {
          const itemsToAdd: any[] = Array.isArray(op.add) ? op.add : [op.add]
          ;(result as any)[field] = [...currentValue, ...itemsToAdd]
        } else {
          // If not an array, just replace with the add value
          (result as any)[field] = op.add
        }
      } else if ('remove' in op) {
        const currentValue = (result as any)[field]
        if (Array.isArray(currentValue)) {
          const itemsToRemove = Array.isArray(op.remove) ? op.remove : [op.remove]
          
          // Special handling for successMetrics (objects with properties)
          if (field === 'successMetrics') {
            (result as any)[field] = currentValue.filter((item: any) => {
              return !itemsToRemove.some((removeItem: any) => {
                if (typeof removeItem === 'string') {
                  return item.metric === removeItem
                }
                return JSON.stringify(item) === JSON.stringify(removeItem)
              })
            })
          } else {
            // For simple string arrays
            (result as any)[field] = currentValue.filter((item: any) => 
              !itemsToRemove.includes(item)
            )
          }
        }
      }
    }
  }
  
  // Validate the result
  const validated = PRDSchema.safeParse(result)
  if (!validated.success) {
    console.error('Patch application resulted in invalid PRD:', validated.error)
    throw new Error(`Invalid PRD after patch: ${validated.error.message}`)
  }
  
  return validated.data
}