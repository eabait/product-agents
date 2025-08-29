'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { contextStorage } from '@/lib/context-storage'
import { ContextSettings } from '@/lib/context-types'

interface ContextSettingsContextType {
  contextSettings: ContextSettings
  updateContextSettings: (updates: Partial<ContextSettings>) => void
  refreshContextSettings: () => void
}

const ContextSettingsContext = createContext<ContextSettingsContextType | undefined>(undefined)

interface ContextSettingsProviderProps {
  children: ReactNode
}

export function ContextSettingsProvider({ children }: ContextSettingsProviderProps) {
  const [contextSettings, setContextSettings] = useState<ContextSettings>(() => {
    // Initialize with current settings from storage
    return contextStorage.getContextSettings()
  })

  // Function to update settings
  const updateContextSettings = (updates: Partial<ContextSettings>) => {
    const newSettings = contextStorage.updateContextSettings(updates)
    setContextSettings(newSettings)
    
    // Emit a custom event to notify other components
    window.dispatchEvent(new CustomEvent('contextSettingsChanged', { 
      detail: newSettings 
    }))
  }

  // Function to refresh settings from storage
  const refreshContextSettings = () => {
    const currentSettings = contextStorage.getContextSettings()
    setContextSettings(currentSettings)
  }

  // Listen for storage changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'prd-agent-context-settings') {
        refreshContextSettings()
      }
    }

    // Listen for our custom context settings change event
    const handleContextSettingsChange = (e: CustomEvent) => {
      setContextSettings(e.detail)
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('contextSettingsChanged', handleContextSettingsChange as EventListener)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('contextSettingsChanged', handleContextSettingsChange as EventListener)
    }
  }, [])

  const value: ContextSettingsContextType = {
    contextSettings,
    updateContextSettings,
    refreshContextSettings,
  }

  return (
    <ContextSettingsContext.Provider value={value}>
      {children}
    </ContextSettingsContext.Provider>
  )
}

export function useContextSettings(): ContextSettingsContextType {
  const context = useContext(ContextSettingsContext)
  if (context === undefined) {
    throw new Error('useContextSettings must be used within a ContextSettingsProvider')
  }
  return context
}