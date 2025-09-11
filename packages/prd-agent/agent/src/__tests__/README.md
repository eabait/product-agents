# PRD Agent Tests

This directory contains comprehensive tests for the **simplified PRD architecture** with parallel processing and 5-section structure.

## Test Files

### `simplified-architecture.test.ts`
**Main test file for the new simplified PRD architecture**

- Tests parallel processing of 5 sections after context analysis
- Validates flat, simple schemas for each section
- Tests section-level editing with parallel architecture
- Demonstrates significant performance improvements

### `architecture-comparison.test.ts`  
**Performance comparison between legacy and simplified architectures**

- Documents improvements: 15+ LLM calls → 7 LLM calls (53% reduction)
- Shows 5-8x faster generation through parallel processing
- Validates content quality and frontend compatibility
- Provides detailed metrics and achievement summary

### `legacy-architecture.test.ts`
**Deprecated test for reference only**

- Documents the old 6-worker sequential pipeline (deprecated)
- Kept for historical reference of the architecture evolution

### `mock-openrouter-client.ts`
**Mock implementation for testing without API calls**

- Intercepts all LLM calls and returns controlled responses
- Records detailed traces of every prompt sent
- Provides helper methods for analyzing prompt flow

## Running Tests

```bash
# Run all tests
npm test

# Run only simplified architecture tests
npm test simplified-architecture.test.ts

# Run architecture comparison test
npm test architecture-comparison.test.ts

# Run tests with detailed console output (shows performance metrics)
ENABLE_TEST_LOGS=1 npm test

# Run tests in watch mode
npm run test:watch
```

## New Architecture Test Output

The tests provide detailed console output showing performance improvements:

```
🚀 ARCHITECTURE PERFORMANCE COMPARISON
┌─────────────────────────────────────────────────────────────────┐
│                    LEGACY VS SIMPLIFIED                        │
├─────────────────────────────────────────────────────────────────┤
│ METRIC              │ LEGACY (OLD)    │ SIMPLIFIED (NEW)    │
├─────────────────────────────────────────────────────────────────┤
│ LLM Calls           │ 15+ calls       │ 7 calls             │
│ Processing          │ Sequential      │ Parallel            │
│ Generation Time     │ ~35-50 seconds  │ ~6-10 seconds       │
│ Sections Generated  │ 4 complex       │ 5 simple            │
│ Schema Complexity   │ Deeply nested   │ Flat structures     │
│ Maintenance         │ High complexity │ Low complexity      │
└─────────────────────────────────────────────────────────────────┘
```

## Key Benefits of New Architecture

- **⚡ Performance**: 5-8x faster generation through parallel processing
- **🎯 Efficiency**: 53% fewer LLM calls (15+ → 7 calls)
- **📋 Simplicity**: Flat schemas instead of deeply nested structures  
- **🔧 Maintainability**: Single analyzer eliminates duplicate calls
- **🎨 Product-Focused**: Concise 1-page PRDs for actionable planning

## Extending Tests

To add new test scenarios:

1. Add mock responses in `beforeEach()` setup
2. Create test cases with different user inputs
3. Verify prompt content and worker sequence
4. Use `mockClient.traces` to inspect detailed flow

The mock client automatically categorizes workers based on prompt patterns, making it easy to trace execution across the pipeline.