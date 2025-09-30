/**
 * Shared streaming types for PRD Agent
 */

export interface ProgressEvent {
  type: 'status' | 'worker_start' | 'worker_complete' | 'section_start' | 'section_complete' | 'final'
  timestamp: string
  message?: string
  worker?: string
  section?: string
  data?: any
  confidence?: number
  error?: string
}

export type ProgressCallback = (event: ProgressEvent) => void

export interface StreamingSettings {
  enabled?: boolean
  timeout?: number
  retries?: number
}

export interface StreamingResponse<T> {
  type: 'partial' | 'complete' | 'error'
  data?: T
  error?: string
  progress?: ProgressEvent
}