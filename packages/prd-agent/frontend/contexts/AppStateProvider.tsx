'use client'

import React, { ReactNode } from 'react'
import { ModelContextProvider } from './ModelContextProvider'
import { ContextSettingsProvider } from './ContextSettingsProvider'

interface AppStateProviderProps {
  children: ReactNode
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  return (
    <ModelContextProvider>
      <ContextSettingsProvider>
        {children}
      </ContextSettingsProvider>
    </ModelContextProvider>
  )
}

// Re-export hooks for convenience
export { useModelContext } from './ModelContextProvider'
export { useContextSettings } from './ContextSettingsProvider'