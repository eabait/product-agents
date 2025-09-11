"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelectContextType {
  value: string
  // eslint-disable-next-line no-unused-vars
  onValueChange: (value: string) => void
  open: boolean
  // eslint-disable-next-line no-unused-vars
  setOpen: (open: boolean) => void
  disabled?: boolean
  itemLabels: Map<string, string>
}

const SelectContext = React.createContext<SelectContextType | null>(null)

// Helper function to extract text content from React children
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') {
    return children
  }
  if (typeof children === 'number') {
    return children.toString()
  }
  if (React.isValidElement(children)) {
    // Handle div elements with nested content by extracting from their children
    if (children.props.children) {
      return extractTextFromChildren(children.props.children)
    }
  }
  if (Array.isArray(children)) {
    // Join array elements, but prioritize the first meaningful text found
    const texts = children.map(extractTextFromChildren).filter(text => text.trim())
    return texts.length > 0 ? texts[0] : texts.join(' ')
  }
  return ''
}

const Select = React.forwardRef<
  HTMLDivElement,
  {
    value?: string
    // eslint-disable-next-line no-unused-vars
    onValueChange?: (value: string) => void
    disabled?: boolean
    children: React.ReactNode
    className?: string
  }
>(({ value = "", onValueChange = () => {}, disabled = false, children, className }, ref) => {
  const [open, setOpen] = React.useState(false)
  
  // Synchronously extract item labels from children
  const itemLabels = React.useMemo(() => {
    const labels = new Map<string, string>()
    
    // Traverse children to find SelectContent
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child) && child.type === SelectContent) {
        // Traverse SelectContent children to find SelectItems
        React.Children.forEach(child.props.children, (item) => {
          if (React.isValidElement(item) && item.type === SelectItem) {
            const itemValue = (item.props as any).value
            const itemLabel = extractTextFromChildren((item.props as any).children)
            if (itemValue && itemLabel) {
              labels.set(itemValue, itemLabel)
              console.log(`[Select] Extracted label: "${itemValue}" -> "${itemLabel}"`)
            } else {
              console.warn(`[Select] Failed to extract label for item:`, { itemValue, itemLabel, item })
            }
          }
        })
      }
    })
    
    console.log(`[Select] Final itemLabels Map:`, labels)
    return labels
  }, [children])

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, disabled, itemLabels }}>
      <div ref={ref} className={cn("relative", className)}>
        {children}
      </div>
    </SelectContext.Provider>
  )
})
Select.displayName = "Select"

const SelectGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("", className)} {...props} />
))
SelectGroup.displayName = "SelectGroup"

const SelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    placeholder?: string
  }
>(({ className, placeholder, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectValue must be used within Select")

  // Get the display text from the labels map, fallback to value or placeholder
  let displayText = context.value 
    ? (context.itemLabels.get(context.value) || context.value)
    : (placeholder || "")
  
  // If we have a value but no proper display text, try to provide a better fallback
  if (context.value && displayText === context.value) {
    // For category values, try to provide a readable fallback
    if (context.value === 'requirement') displayText = 'Business Requirements'
    else if (context.value === 'constraint') displayText = 'Technical Constraints'
    else if (context.value === 'assumption') displayText = 'Business Assumptions'
    else if (context.value === 'stakeholder') displayText = 'Stakeholder Needs'
    else if (context.value === 'custom') displayText = 'Custom Context'
  }
  
  console.log(`[SelectValue] Displaying: value="${context.value}", displayText="${displayText}", availableLabels:`, Array.from(context.itemLabels.entries()))

  return (
    <span ref={ref} className={cn("block", className)} title={displayText} {...props}>
      {displayText}
    </span>
  )
})
SelectValue.displayName = "SelectValue"

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectTrigger must be used within Select")

  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={context.open}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      disabled={context.disabled}
      onClick={() => !context.disabled && context.setOpen(!context.open)}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 opacity-50" />
    </button>
  )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    position?: "item-aligned" | "popper"
  }
  // eslint-disable-next-line no-unused-vars
>(({ className, children, position = "popper", ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectContent must be used within Select")

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (ref && 'current' in ref && ref.current && !ref.current.contains(target)) {
        context.setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        context.setOpen(false)
      }
    }

    if (context.open) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleEscape)
      }
    }
  }, [context.open, ref, context])

  if (!context.open) return null

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 mt-1 w-full",
        className
      )}
      role="listbox"
      {...props}
    >
      <div className="p-1 max-h-80 overflow-auto">
        {children}
      </div>
    </div>
  )
})
SelectContent.displayName = "SelectContent"

const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold text-muted-foreground", className)}
    {...props}
  />
))
SelectLabel.displayName = "SelectLabel"

const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value: string
  }
>(({ className, children, value, ...props }, ref) => {
  const context = React.useContext(SelectContext)
  if (!context) throw new Error("SelectItem must be used within Select")

  const isSelected = context.value === value

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
        isSelected && "bg-accent text-accent-foreground",
        className
      )}
      onClick={() => {
        context.onValueChange(value)
        context.setOpen(false)
      }}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4" />}
      </span>
      <span className="break-words">{children}</span>
    </div>
  )
})
SelectItem.displayName = "SelectItem"

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = "SelectSeparator"

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
}