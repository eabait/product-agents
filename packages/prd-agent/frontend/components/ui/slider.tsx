"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps {
  value?: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value = [0], onValueChange, min = 0, max = 100, step = 1, disabled = false, ...props }, ref) => {
    const currentValue = Array.isArray(value) ? value[0] : value
    
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(event.target.value)
      onValueChange?.([newValue])
    }

    return (
      <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
        {/* Custom styled range input */}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            "w-full h-2 bg-secondary rounded-full appearance-none cursor-pointer",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            // Custom slider thumb styling
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2",
            "[&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:cursor-pointer",
            "[&::-webkit-slider-thumb]:transition-colors [&::-webkit-slider-thumb]:hover:bg-primary/90",
            // Firefox styling
            "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2",
            "[&::-moz-range-thumb]:border-primary [&::-moz-range-thumb]:cursor-pointer",
            "[&::-moz-range-thumb]:transition-colors [&::-moz-range-thumb]:hover:bg-primary/90",
            "[&::-moz-range-track]:bg-secondary [&::-moz-range-track]:rounded-full",
            // Disabled state
            "disabled:cursor-not-allowed disabled:opacity-50",
            "[&:disabled::-webkit-slider-thumb]:cursor-not-allowed",
            "[&:disabled::-moz-range-thumb]:cursor-not-allowed"
          )}
          {...props}
        />
        
        {/* Progress fill overlay */}
        <div 
          className="absolute h-2 bg-primary rounded-full pointer-events-none"
          style={{
            width: `${((currentValue - min) / (max - min)) * 100}%`
          }}
        />
      </div>
    )
  }
)

Slider.displayName = "Slider"

export { Slider }