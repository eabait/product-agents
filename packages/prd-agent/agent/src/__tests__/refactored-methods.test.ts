/**
 * Refactored Methods Tests
 * 
 * This test suite validates that the refactored utility functions and extracted methods
 * work correctly and maintain the same behavior as the original code.
 */

import {
  createHttpResponse,
  createSuccessResponse,
  createErrorResponse,
  buildPRDMetadata,
  validateAgentSettings,
  extractSectionNames,
  isValidSectionName,
  createValidationResult,
  safeParseJSON
} from '../utilities'
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  CURRENT_PRD_VERSION,
  ALL_SECTION_NAMES,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  FALLBACK_MAX_TOKENS
} from '../constants'

describe('Refactored Utility Functions', () => {
  describe('HTTP Response Utilities', () => {
    test('createHttpResponse should create standardized response', () => {
      const data = { test: 'data' }
      const response = createHttpResponse(HTTP_STATUS.OK, data)
      
      expect(response).toEqual({
        statusCode: HTTP_STATUS.OK,
        contentType: 'application/json',
        body: JSON.stringify(data)
      })
    })

    test('createSuccessResponse should create OK response', () => {
      const data = { result: 'success' }
      const response = createSuccessResponse(data)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(response.contentType).toBe('application/json')
      expect(response.body).toBe(JSON.stringify(data))
    })

    test('createErrorResponse should create error response', () => {
      const message = 'Test error'
      const response = createErrorResponse(HTTP_STATUS.BAD_REQUEST, message)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(response.contentType).toBe('application/json')
      expect(response.body).toBe(JSON.stringify({ error: message }))
    })

    test('should handle custom content types', () => {
      const response = createHttpResponse(HTTP_STATUS.OK, 'plain text', 'text/plain')
      expect(response.contentType).toBe('text/plain')
    })
  })

  describe('PRD Metadata Builder', () => {
    test('buildPRDMetadata should create complete metadata', () => {
      const sectionsGenerated = ['targetUsers', 'solution']
      const confidenceAssessments = {
        targetUsers: { level: 'high' as const, reasons: [], factors: {} },
        solution: { level: 'medium' as const, reasons: [], factors: {} }
      }
      const overallConfidence = { level: 'medium' as const, reasons: [], factors: {} }
      const processingTimeMs = 5000
      
      const metadata = buildPRDMetadata({
        sectionsGenerated,
        confidenceAssessments,
        overallConfidence,
        processingTimeMs
      })
      
      expect(metadata.version).toBe(CURRENT_PRD_VERSION)
      expect(metadata.generatedBy).toBe('PRD Orchestrator Agent')
      expect(metadata.sections_generated).toEqual(sectionsGenerated)
      expect(metadata.confidence_assessments).toEqual(confidenceAssessments)
      expect(metadata.overall_confidence).toEqual(overallConfidence)
      expect(metadata.processing_time_ms).toBe(processingTimeMs)
      expect(metadata.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    test('should merge with existing metadata', () => {
      const existingMetadata = {
        customField: 'custom value',
        oldVersion: '1.0'
      }
      
      const metadata = buildPRDMetadata({
        sectionsGenerated: ['targetUsers'],
        confidenceAssessments: {},
        overallConfidence: { level: 'medium' as const, reasons: [], factors: {} },
        existingMetadata
      })
      
      expect(metadata.customField).toBe('custom value')
      expect(metadata.version).toBe(CURRENT_PRD_VERSION) // Should override
      expect(metadata.oldVersion).toBe('1.0') // Should preserve
    })

    test('should work without optional parameters', () => {
      const metadata = buildPRDMetadata({
        sectionsGenerated: ['solution'],
        confidenceAssessments: {},
        overallConfidence: { level: 'low' as const, reasons: [], factors: {} }
      })
      
      expect(metadata.version).toBe(CURRENT_PRD_VERSION)
      expect(metadata.sections_generated).toEqual(['solution'])
      expect(metadata.processing_time_ms).toBeUndefined()
    })
  })

  describe('Agent Settings Validation', () => {
    const validDefaults = {
      apiKey: 'default-key',
      model: 'default-model',
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS
    }

    test('validateAgentSettings should merge settings correctly', () => {
      const requestSettings = {
        apiKey: 'custom-key',
        temperature: 0.5
      }
      
      const result = validateAgentSettings(requestSettings, validDefaults)
      
      expect(result.apiKey).toBe('custom-key')
      expect(result.model).toBe('default-model')
      expect(result.temperature).toBe(0.5)
      expect(result.maxTokens).toBe(DEFAULT_MAX_TOKENS)
    })

    test('should throw error for missing API key', () => {
      const settings = { model: 'test-model' }
      const defaults = { ...validDefaults, apiKey: undefined }
      
      expect(() => validateAgentSettings(settings, defaults))
        .toThrow(ERROR_MESSAGES.MISSING_API_KEY)
    })

    test('should throw error for missing model', () => {
      const settings = { apiKey: 'test-key' }
      const defaults = { ...validDefaults, model: undefined }
      
      expect(() => validateAgentSettings(settings, defaults))
        .toThrow(ERROR_MESSAGES.INVALID_MODEL)
    })

    test('should validate and correct invalid temperature', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      const settings = { temperature: 3.0 } // Invalid - too high
      const result = validateAgentSettings(settings, validDefaults)
      
      expect(result.temperature).toBe(DEFAULT_TEMPERATURE)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid temperature')
      )
      
      consoleSpy.mockRestore()
    })

    test('should validate and correct invalid maxTokens', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      
      const settings = { maxTokens: -100 } // Invalid - negative
      const result = validateAgentSettings(settings, validDefaults)
      
      expect(result.maxTokens).toBe(FALLBACK_MAX_TOKENS)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid maxTokens')
      )
      
      consoleSpy.mockRestore()
    })

    test('should handle undefined settings', () => {
      const result = validateAgentSettings(undefined, validDefaults)
      expect(result).toEqual(validDefaults)
    })
  })

  describe('Section Name Utilities', () => {
    test('extractSectionNames should handle arrays', () => {
      const input = ['targetUsers', 'solution']
      const result = extractSectionNames(input)
      expect(result).toEqual(['targetUsers', 'solution'])
    })

    test('extractSectionNames should handle single string', () => {
      const result = extractSectionNames('targetUsers')
      expect(result).toEqual(['targetUsers'])
    })

    test('extractSectionNames should handle undefined', () => {
      const result = extractSectionNames(undefined)
      expect(result).toEqual([])
    })

    test('isValidSectionName should validate correctly', () => {
      expect(isValidSectionName('targetUsers', ALL_SECTION_NAMES)).toBe(true)
      expect(isValidSectionName('invalidSection', ALL_SECTION_NAMES)).toBe(false)
      expect(isValidSectionName('solution', ALL_SECTION_NAMES)).toBe(true)
    })

    test('isValidSectionName should be case-sensitive', () => {
      expect(isValidSectionName('TargetUsers', ALL_SECTION_NAMES)).toBe(false)
      expect(isValidSectionName('TARGETUSERS', ALL_SECTION_NAMES)).toBe(false)
    })
  })

  describe('Validation Result Creator', () => {
    test('createValidationResult should create valid result', () => {
      const result = createValidationResult(true)
      
      expect(result).toEqual({
        is_valid: true,
        issues: [],
        warnings: []
      })
    })

    test('createValidationResult should create invalid result with issues', () => {
      const issues = ['Missing required field', 'Invalid format']
      const warnings = ['Consider improving X']
      const result = createValidationResult(false, issues, warnings)
      
      expect(result).toEqual({
        is_valid: false,
        issues,
        warnings
      })
    })

    test('should handle empty arrays by default', () => {
      const result = createValidationResult(false)
      expect(result.issues).toEqual([])
      expect(result.warnings).toEqual([])
    })
  })

  describe('Safe JSON Parser', () => {
    test('safeParseJSON should parse valid JSON', () => {
      const jsonString = '{"test": "value", "number": 123}'
      const result = safeParseJSON(jsonString)
      
      expect(result).toEqual({ test: 'value', number: 123 })
    })

    test('safeParseJSON should return fallback for invalid JSON', () => {
      const invalidJson = '{"incomplete": true'
      const fallback = { error: 'invalid' }
      const result = safeParseJSON(invalidJson, fallback)
      
      expect(result).toEqual(fallback)
    })

    test('safeParseJSON should use default fallback', () => {
      const result = safeParseJSON('invalid json')
      expect(result).toEqual({})
    })

    test('safeParseJSON should handle empty string', () => {
      const result = safeParseJSON('')
      expect(result).toEqual({})
    })

    test('safeParseJSON should handle null values', () => {
      const result = safeParseJSON('null')
      expect(result).toBeNull()
    })

    test('safeParseJSON should handle arrays', () => {
      const result = safeParseJSON('[1, 2, 3]')
      expect(result).toEqual([1, 2, 3])
    })
  })

  describe('Integration Tests', () => {
    test('should work together in typical workflow', () => {
      // Simulate a typical request processing workflow
      
      // 1. Validate settings
      const settings = validateAgentSettings(
        { apiKey: 'test-key', temperature: 0.4 },
        { model: 'test-model', temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS }
      )
      
      // 2. Extract section names
      const sections = extractSectionNames(['targetUsers', 'solution'])
      
      // 3. Validate section names
      const validSections = sections.filter(s => isValidSectionName(s, ALL_SECTION_NAMES))
      
      // 4. Build metadata
      const metadata = buildPRDMetadata({
        sectionsGenerated: validSections,
        confidenceAssessments: {},
        overallConfidence: { level: 'medium' as const, reasons: [], factors: {} }
      })
      
      // 5. Create response
      const response = createSuccessResponse({ sections: validSections, metadata })
      
      expect(settings.apiKey).toBe('test-key')
      expect(validSections).toEqual(['targetUsers', 'solution'])
      expect(metadata.version).toBe(CURRENT_PRD_VERSION)
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
    })

    test('should handle error scenarios gracefully', () => {
      // Test error handling throughout the workflow
      
      try {
        validateAgentSettings({}, { temperature: DEFAULT_TEMPERATURE, maxTokens: DEFAULT_MAX_TOKENS })
      } catch (error) {
        const errorResponse = createErrorResponse(
          HTTP_STATUS.BAD_REQUEST,
          (error as Error).message
        )
        
        expect(errorResponse.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
        expect(errorResponse.body).toContain('error')
      }
    })
  })
})