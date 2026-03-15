
"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string
  label: React.ReactNode
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onSelect: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyPlaceholder?: string
  onSearch?: (query: string) => Promise<void> | void
  popoverModal?: boolean
}

export function Combobox({
  options,
  value,
  onSelect,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  emptyPlaceholder = "No option found.",
  onSearch,
  popoverModal = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const focusInput = React.useCallback(() => {
    const input = inputRef.current
    if (!input) return
    input.focus({ preventScroll: true })
    const caret = input.value.length
    try {
      input.setSelectionRange(caret, caret)
    } catch {
      // Some input types don't support selection; safe to ignore.
    }
  }, [])

  const getSearchableText = React.useCallback((node: React.ReactNode): string => {
    if (node === null || node === undefined || typeof node === "boolean") {
      return ""
    }

    if (typeof node === "string" || typeof node === "number") {
      return String(node)
    }

    if (Array.isArray(node)) {
      return node.map(getSearchableText).filter(Boolean).join(" ")
    }

    if (React.isValidElement(node)) {
      const children = (node.props as { children?: React.ReactNode })?.children
      return getSearchableText(children)
    }

    return ""
  }, [])

  React.useEffect(() => {
    if (!open) {
      setSearchValue("")
      return
    }

    const timer = window.setTimeout(() => {
      focusInput()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [open, focusInput])

  const handleSearch = React.useCallback(
    async (query: string) => {
      setSearchValue(query)
      if (!onSearch) return
      setIsLoading(true)
      try {
        await onSearch(query)
      } finally {
        setIsLoading(false)
      }
    },
    [onSearch]
  )

  const selectedOption = options.find((option) => option.value.toLowerCase() === value?.toLowerCase())
  const selectedLabel = selectedOption
    ? getSearchableText(selectedOption.label) || selectedOption.value
    : value

  return (
    <Popover modal={popoverModal} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value ? selectedLabel : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          window.setTimeout(() => focusInput(), 0)
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={!onSearch}>
          <CommandInput
            ref={inputRef}
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={(query) => {
              void handleSearch(query)
            }}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex justify-center items-center p-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyPlaceholder}</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={`${option.value} ${getSearchableText(option.label)}`.trim()}
                      onSelect={() => {
                        onSelect(option.value === value ? "" : option.value)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === option.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
