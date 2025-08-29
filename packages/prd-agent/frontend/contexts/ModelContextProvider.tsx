'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface Model {
  id: string
  name: string
  provider: string
  contextLength: number
  isTopProvider?: boolean
  isModerated?: boolean
  pricing: {
    promptFormatted: string
    completionFormatted: string
  }
}

interface ModelContextType {
  currentModel: Model | null
  models: Model[]
  currentModelContextWindow: number | undefined
  setCurrentModel: (model: Model | null) => void
  setModels: (models: Model[]) => void
  updateModelFromId: (modelId: string) => void
}

const ModelContext = createContext<ModelContextType | undefined>(undefined)

interface ModelContextProviderProps {
  children: ReactNode
}

export function ModelContextProvider({ children }: ModelContextProviderProps) {
  const [currentModel, setCurrentModel] = useState<Model | null>(null)
  const [models, setModels] = useState<Model[]>([])
  const [currentModelContextWindow, setCurrentModelContextWindow] = useState<number | undefined>(undefined)

  // Update context window when current model changes
  useEffect(() => {
    if (currentModel?.contextLength) {
      setCurrentModelContextWindow(currentModel.contextLength)
    } else {
      setCurrentModelContextWindow(undefined)
    }
  }, [currentModel])

  // Helper function to update current model from model ID
  const updateModelFromId = (modelId: string) => {
    if (!modelId) {
      setCurrentModel(null)
      return
    }

    const foundModel = models.find(m => m.id === modelId)
    if (foundModel) {
      setCurrentModel(foundModel)
    } else {
      // Model not found in current list, clear current model
      setCurrentModel(null)
    }
  }

  // Update current model when models list changes and we have a current model ID
  useEffect(() => {
    if (currentModel && models.length > 0) {
      const updatedModel = models.find(m => m.id === currentModel.id)
      if (updatedModel && updatedModel !== currentModel) {
        setCurrentModel(updatedModel)
      }
    }
  }, [models, currentModel])

  const value: ModelContextType = {
    currentModel,
    models,
    currentModelContextWindow,
    setCurrentModel,
    setModels,
    updateModelFromId,
  }

  return (
    <ModelContext.Provider value={value}>
      {children}
    </ModelContext.Provider>
  )
}

export function useModelContext(): ModelContextType {
  const context = useContext(ModelContext)
  if (context === undefined) {
    throw new Error('useModelContext must be used within a ModelContextProvider')
  }
  return context
}