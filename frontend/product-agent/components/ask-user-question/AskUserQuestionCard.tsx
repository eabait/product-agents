'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { HelpCircle, ChevronRight, SkipForward } from 'lucide-react'

interface QuestionOption {
  label: string
  description: string
}

interface Question {
  id: string
  header: string
  question: string
  options: QuestionOption[]
  multiSelect: boolean
  required: boolean
}

interface AskUserQuestionResponse {
  answers: Array<{
    questionId: string
    selectedOptions?: string[]
    customText?: string
    skipped: boolean
  }>
  allSkipped: boolean
  feedback?: string
}

interface AskUserQuestionCardProps {
  questions: Question[]
  context?: string
  canSkip: boolean
  onSubmit: (response: AskUserQuestionResponse) => void
  isProcessing?: boolean
  submitLabel?: string
}

export function AskUserQuestionCard({
  questions,
  context,
  canSkip,
  onSubmit,
  isProcessing = false,
  submitLabel
}: AskUserQuestionCardProps) {
  // Track selections per question
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [customTexts, setCustomTexts] = useState<Record<string, string>>({})
  const [showOther, setShowOther] = useState<Record<string, boolean>>({})

  const handleOptionToggle = (
    questionId: string,
    optionLabel: string,
    multiSelect: boolean
  ) => {
    setSelections((prev) => {
      const current = prev[questionId] || []
      if (multiSelect) {
        // Toggle selection
        if (current.includes(optionLabel)) {
          return { ...prev, [questionId]: current.filter((l) => l !== optionLabel) }
        }
        return { ...prev, [questionId]: [...current, optionLabel] }
      }
      // Single select - replace
      return { ...prev, [questionId]: [optionLabel] }
    })
  }

  const handleSubmit = () => {
    const answers = questions.map((q) => ({
      questionId: q.id,
      selectedOptions: selections[q.id] || [],
      customText: customTexts[q.id],
      skipped: false
    }))
    onSubmit({ answers, allSkipped: false })
  }

  const handleSkipAll = () => {
    const answers = questions.map((q) => ({
      questionId: q.id,
      skipped: true
    }))
    onSubmit({ answers, allSkipped: true })
  }

  const isComplete = questions.every((q) => {
    if (!q.required) return true
    const hasSelection = (selections[q.id] || []).length > 0
    const hasCustom = !!customTexts[q.id]?.trim()
    return hasSelection || hasCustom
  })

  return (
    <Card className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 dark:from-amber-950/30 dark:to-orange-950/30 dark:border-amber-800">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
            I need a bit more information
          </h3>
        </div>

        {context && (
          <p className="text-sm text-gray-700 dark:text-gray-300">{context}</p>
        )}

        {/* Questions */}
        <div className="space-y-6">
          {questions.map((question) => (
            <div key={question.id} className="space-y-3">
              {/* Question Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-100 dark:border-amber-700">
                  {question.header}
                </Badge>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {question.question}
                </span>
              </div>

              {/* Options Grid */}
              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const isSelected = (selections[question.id] || []).includes(option.label)
                  return (
                    <button
                      key={option.label}
                      onClick={() =>
                        handleOptionToggle(question.id, option.label, question.multiSelect)
                      }
                      disabled={isProcessing}
                      className={`
                        p-3 rounded-lg border text-left transition-all
                        ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200 dark:bg-amber-900/50 dark:ring-amber-700'
                            : 'border-gray-200 bg-white hover:border-amber-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-amber-600'
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      <div className="flex items-start gap-2">
                        {question.multiSelect ? (
                          <Checkbox
                            checked={isSelected}
                            className="mt-0.5"
                            disabled={isProcessing}
                          />
                        ) : (
                          <div
                            className={`
                            w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center
                            ${isSelected ? 'border-amber-500 bg-amber-500' : 'border-gray-300 dark:border-gray-600'}
                          `}
                          >
                            {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {option.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Other / Custom Input */}
              <div>
                <button
                  onClick={() =>
                    setShowOther((prev) => ({ ...prev, [question.id]: !prev[question.id] }))
                  }
                  disabled={isProcessing}
                  className="text-sm text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 flex items-center gap-1 disabled:opacity-50"
                >
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${showOther[question.id] ? 'rotate-90' : ''}`}
                  />
                  Other (specify)
                </button>
                {showOther[question.id] && (
                  <Textarea
                    value={customTexts[question.id] || ''}
                    onChange={(e) =>
                      setCustomTexts((prev) => ({ ...prev, [question.id]: e.target.value }))
                    }
                    placeholder="Enter your custom response..."
                    className="mt-2"
                    rows={2}
                    disabled={isProcessing}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-amber-200 dark:border-amber-800">
          <Button
            onClick={handleSubmit}
            disabled={!isComplete || isProcessing}
            className="flex-1 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
          >
            {isProcessing ? 'Submitting...' : (submitLabel ?? 'Continue')}
          </Button>
          {canSkip && (
            <Button
              onClick={handleSkipAll}
              disabled={isProcessing}
              variant="outline"
              className="flex items-center gap-1"
            >
              <SkipForward className="w-4 h-4" />
              Skip
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
