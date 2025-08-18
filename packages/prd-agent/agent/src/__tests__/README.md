# PRD Agent Tests

This directory contains comprehensive tests for the PRD agent implementation, with a focus on **prompt tracing** and **agent pipeline flow**.

## Test Files

### `prompt-tracing.test.ts`
**Main test file for observing prompt flow through the agent pipeline**

- Tests complete PRD generation flow with all 5 workers
- Tests PRD edit flow using the ChangeWorker
- Traces prompts as they flow between workers with cumulative context
- Provides detailed console output showing prompt evolution

### `agent-pipeline.test.ts`
**Individual worker testing and prompt validation**

- Tests each worker in isolation
- Validates prompt generation for specific scenarios
- Demonstrates data flow between workers
- Shows how context accumulates through the pipeline

### `mock-openrouter-client.ts`
**Mock implementation for testing without API calls**

- Intercepts all LLM calls and returns controlled responses
- Records detailed traces of every prompt sent
- Provides helper methods for analyzing prompt flow

## Running Tests

```bash
# Run all tests
npm test

# Run only prompt tracing tests
npm run test:prompts

# Run tests with detailed console output
ENABLE_TEST_LOGS=1 npm test

# Run tests in watch mode
npm run test:watch
```

## Test Output

The tests provide detailed console output showing:

1. **Prompt Traces**: Complete prompts sent to each worker
2. **Worker Sequence**: Order of worker execution
3. **Context Flow**: How data accumulates between workers
4. **Response Validation**: Ensuring mock responses match expected schemas

## Example Output

```
=== DETAILED PROMPT TRACES ===

--- 1. CONTEXTANALYSIS ---
Timestamp: 2023-12-07T10:30:00.000Z
Model: anthropic/claude-3-5-sonnet
Temperature: 0.3
Prompt:
Analyze this product request and extract key themes, requirements, and constraints: I need a user authentication system...

--- 2. REQUIREMENTSEXTRACTION ---
Timestamp: 2023-12-07T10:30:01.000Z
Model: anthropic/claude-3-5-sonnet
Temperature: 0.3
Prompt:
Extract functional and non-functional requirements from:
Original request: I need a user authentication system...
Context analysis: {"themes":["User authentication","Data security"]...}
```

## Key Benefits

- **🔍 Visibility**: See exactly what prompts are generated
- **🧪 Testing**: Validate prompt logic without API costs
- **📊 Analysis**: Understand how context builds through pipeline
- **🐛 Debugging**: Identify prompt issues early
- **📝 Documentation**: Demonstrate agent capabilities

## Extending Tests

To add new test scenarios:

1. Add mock responses in `beforeEach()` setup
2. Create test cases with different user inputs
3. Verify prompt content and worker sequence
4. Use `mockClient.traces` to inspect detailed flow

The mock client automatically categorizes workers based on prompt patterns, making it easy to trace execution across the pipeline.