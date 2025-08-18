/**
 * Jest Setup File
 * 
 * Global test configuration and setup for PRD agent tests.
 */

// Extend Jest matchers if needed
declare global {
  namespace jest {
    interface Matchers<R> {
      // Add custom matchers here if needed
    }
  }
}

// Global test timeout
jest.setTimeout(30000)

// Mock console.log in tests unless explicitly enabled
const originalConsoleLog = console.log
beforeEach(() => {
  if (!process.env.ENABLE_TEST_LOGS) {
    console.log = jest.fn()
  }
})

afterEach(() => {
  console.log = originalConsoleLog
})