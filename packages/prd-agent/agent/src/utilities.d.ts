/**
 * Utility functions for PRD Agent
 * Common patterns extracted from the codebase to reduce duplication
 */
import { ConfidenceAssessment } from '@product-agents/prd-shared';
/**
 * Creates a standardized HTTP response
 */
export declare function createHttpResponse(statusCode: number, data: any, contentType?: string): {
    statusCode: number;
    contentType: string;
    body: string;
};
/**
 * Creates a success HTTP response
 */
export declare function createSuccessResponse(data: any): ReturnType<typeof createHttpResponse>;
/**
 * Creates an error HTTP response
 */
export declare function createErrorResponse(statusCode: number, message: string): ReturnType<typeof createHttpResponse>;
/**
 * Builds PRD metadata with consistent structure
 */
export declare function buildPRDMetadata(options: {
    sectionsGenerated: string[];
    confidenceAssessments: Record<string, ConfidenceAssessment>;
    overallConfidence: ConfidenceAssessment;
    processingTimeMs?: number;
    existingMetadata?: any;
    usageSummary?: any;
}): any;
/**
 * Validates agent settings and provides defaults
 */
export declare function validateAgentSettings(settings: any, defaults: any): any;
/**
 * Extracts section names from various input formats
 */
export declare function extractSectionNames(input: string[] | string | undefined): string[];
/**
 * Checks if a section name is valid
 */
export declare function isValidSectionName(sectionName: string, validSections: readonly string[]): boolean;
/**
 * Creates a standardized validation result
 */
export declare function createValidationResult(isValid: boolean, issues?: string[], warnings?: string[]): {
    is_valid: boolean;
    issues: string[];
    warnings: string[];
};
/**
 * Safely parses JSON with fallback
 */
export declare function safeParseJSON(jsonString: string, fallback?: any): any;
//# sourceMappingURL=utilities.d.ts.map