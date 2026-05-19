"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"

export type ComboboxOption = {
  value: string
  label: React.ReactNode
  [key: string]: unknown
}

type ComboboxProps = {
  options: ComboboxOption[]
  value?: string | null
  onSelect?: (value: string) => void
  onSearch?: (query: string) => void | Promise<void>
  placeholder?: string
  searchPlaceholder?: string
  emptyPlaceholder?: string
  disabled?: boolean
  showClear?: boolean
  className?: string
  inputClassName?: string
  contentClassName?: string
  id?: string
  name?: string
  required?: boolean
  "aria-invalid"?: boolean | "true" | "false"
}

type NormalizedOption = ComboboxOption & {
  labelText: string
}

function getSearchableText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getSearchableText).filter(Boolean).join(" ")
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    return getSearchableText(props.children)
  }
  return ""
}

function normalizeOption(option: ComboboxOption): NormalizedOption {
  const value = String(option?.value ?? "")
  const label = option?.label ?? value
  const labelText = getSearchableText(label) || value
  return { ...option, value, label, labelText }
}

function findSelectedOption(options: NormalizedOption[], selectedValue: string): NormalizedOption | undefined {
  if (!selectedValue) return undefined
  return (
    options.find((o) => o.value === selectedValue) ||
    options.find((o) => o.value.toLowerCase() === selectedValue.toLowerCase())
  )
}

export function Combobox({
  options,
  value,
  onSelect,
  onSearch,
  placeholder = "Select an option...",
  searchPlaceholder,
  emptyPlaceholder = "No items found.",
  disabled = false,
  showClear = false,
  className,
  inputClassName,
  contentClassName,
  id,
  name,
  required,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const itemRefs = React.useRef<Map<number, HTMLButtonElement>>(new Map())
  const searchRequestRef = React.useRef(0)
  const listId = React.useId()

  // ✅ NEW: Prevent onFocus from reopening after programmatic selection/clear
  const skipFocusOpenRef = React.useRef(false)

  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
  const [isSearching, setIsSearching] = React.useState(false)
  const [dropdownWidth, setDropdownWidth] = React.useState<number>()

  const normalizedOptions = React.useMemo(() => (options ?? []).map(normalizeOption), [options])
  const selectedValue = typeof value === "string" ? value : ""
  const selectedOption = React.useMemo(
    () => findSelectedOption(normalizedOptions, selectedValue),
    [normalizedOptions, selectedValue]
  )
  const selectedLabel = selectedOption?.labelText ?? selectedValue

  const filteredOptions = React.useMemo(() => {
    const query = inputValue.trim().toLowerCase()
    if (onSearch || !query) return normalizedOptions
    return normalizedOptions.filter((o) =>
      o.labelText.toLowerCase().includes(query) || o.value.toLowerCase().includes(query)
    )
  }, [inputValue, normalizedOptions, onSearch])

  const focusInput = React.useCallback(() => {
    inputRef.current?.focus({ preventScroll: true })
    const len = inputRef.current?.value.length ?? 0
    try { inputRef.current?.setSelectionRange(len, len) } catch {}
  }, [])

  const runSearch = React.useCallback(
    (query: string) => {
      if (!onSearch) { setIsSearching(false); return }
      const requestId = ++searchRequestRef.current
      try {
        const maybePromise = onSearch(query)
        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
          setIsSearching(true)
          Promise.resolve(maybePromise).catch(() => {}).finally(() => {
            if (searchRequestRef.current === requestId) setIsSearching(false)
          })
        } else if (searchRequestRef.current === requestId) {
          setIsSearching(false)
        }
      } catch {
        if (searchRequestRef.current === requestId) setIsSearching(false)
      }
    },
    [onSearch]
  )

  const closeDropdown = React.useCallback(() => {
    skipFocusOpenRef.current = true
    setOpen(false)
    setHighlightedIndex(-1)
    setIsSearching(false)
    setInputValue(selectedLabel)
    window.requestAnimationFrame(() => { skipFocusOpenRef.current = false })
  }, [selectedLabel])

  const chooseOption = React.useCallback(
    (option: NormalizedOption) => {
      const nextValue = option.value === selectedValue ? "" : option.value
      onSelect?.(nextValue)
      setInputValue(nextValue ? option.labelText : "")
      closeDropdown() // ✅ Uses the safe close logic
      window.requestAnimationFrame(focusInput)
    },
    [onSelect, selectedValue, focusInput, closeDropdown]
  )

  const handleClear = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      onSelect?.("")
      setInputValue("")
      closeDropdown() // ✅ Safe close
      runSearch("")
      window.requestAnimationFrame(focusInput)
    },
    [focusInput, onSelect, runSearch, closeDropdown]
  )

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value
      setInputValue(query)
      if (!open) setOpen(true)
      setHighlightedIndex(0)
      runSearch(query)
    },
    [open, runSearch]
  )

  const handleInputKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (!open) { setOpen(true); return }
        setHighlightedIndex((prev) => {
          if (!filteredOptions.length) return -1
          return prev < 0 ? 0 : (prev + 1) % filteredOptions.length
        })
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        if (!open) { setOpen(true); return }
        setHighlightedIndex((prev) => {
          if (!filteredOptions.length) return -1
          return prev < 0 ? filteredOptions.length - 1 : (prev - 1 + filteredOptions.length) % filteredOptions.length
        })
        return
      }
      if (e.key === "Enter") {
        if (!open) return
        e.preventDefault()
        const option = filteredOptions[highlightedIndex] ?? filteredOptions[0]
        if (option) chooseOption(option)
        return
      }
      if (e.key === "Escape") {
        if (!open) return
        e.preventDefault()
        closeDropdown()
        return
      }
      if (e.key === "Tab") setOpen(false)
    },
    [chooseOption, closeDropdown, filteredOptions, highlightedIndex, open]
  )

  const handleToggleOpen = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return
      setOpen((prev) => {
        if (!prev) window.requestAnimationFrame(focusInput)
        return !prev
      })
    },
    [disabled, focusInput]
  )

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (disabled) return
      setOpen(nextOpen)
      if (nextOpen) window.requestAnimationFrame(focusInput)
    },
    [disabled, focusInput]
  )

  React.useEffect(() => {
    if (open) {
      const idx = filteredOptions.findIndex((o) => o.value === selectedValue)
      setHighlightedIndex(idx >= 0 ? idx : filteredOptions.length > 0 ? 0 : -1)
    } else {
      setHighlightedIndex(-1)
      setInputValue(selectedLabel)
    }
  }, [filteredOptions, open, selectedLabel, selectedValue])

  React.useEffect(() => {
    if (!open || highlightedIndex < 0) return
    itemRefs.current.get(highlightedIndex)?.scrollIntoView({ block: "nearest" })
  }, [highlightedIndex, open])

  React.useEffect(() => {
    if (!anchorRef.current) return
    const el = anchorRef.current
    const updateWidth = () => setDropdownWidth(el.offsetWidth)
    updateWidth()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const showClearButton = showClear && !disabled && (!!selectedValue || !!inputValue)
  const resolvedPlaceholder = searchPlaceholder || placeholder
  const resultLabel = isSearching ? "Searching..." : `${filteredOptions.length} option${filteredOptions.length === 1 ? "" : "s"}`

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange} modal>
      <PopoverPrimitive.Anchor asChild>
        <div ref={anchorRef} className="w-full">
          <InputGroup
            className={cn(
              "w-full border bg-background transition-colors",
              open && "border-primary ring-1 ring-primary",
              className
            )}
          >
            <InputGroupAddon align="inline-start" className="text-muted-foreground">
              <SearchIcon className={cn("size-4", open && "text-primary")} />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              id={id}
              data-slot="combobox-input"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-invalid={ariaInvalid}
              autoComplete="off"
              disabled={disabled}
              placeholder={resolvedPlaceholder}
              value={inputValue}
              // ✅ FIXED: Check ref before opening
              onFocus={() => { 
                if (!disabled && !skipFocusOpenRef.current) setOpen(true)
                skipFocusOpenRef.current = false // Reset safely on focus
              }}
              onClick={() => { if (!disabled) setOpen(true) }}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              className={cn("h-9", inputClassName)}
            />
            <InputGroupAddon align="inline-end" className="gap-1">
              {showClearButton && (
                <InputGroupButton
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  onClick={handleClear}
                  aria-label="Clear selection"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3.5" />
                </InputGroupButton>
              )}
              <InputGroupButton
                type="button"
                size="icon-xs"
                variant="ghost"
                disabled={disabled}
                onClick={handleToggleOpen}
                aria-label={open ? "Close options" : "Open options"}
                className={cn("text-muted-foreground hover:text-foreground", open && "text-primary")}
              >
                <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {name && <input type="hidden" name={name} value={selectedValue} required={required} />}
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
          }}
          className={cn(
            "z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            contentClassName
          )}
          style={dropdownWidth ? { width: dropdownWidth } : undefined}
        >
          <div className="border-b bg-muted px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground font-medium uppercase">{resultLabel}</span>
              {selectedLabel && (
                <span className="max-w-[55%] truncate rounded bg-background px-1.5 py-0.5 text-foreground">
                  {selectedLabel}
                </span>
              )}
            </div>
          </div>

          <div id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {isSearching && (
              <div className="text-muted-foreground flex items-center gap-2 rounded-md px-2.5 py-2 text-xs">
                <Loader2Icon className="size-3.5 animate-spin" />
                Searching...
              </div>
            )}

            {!isSearching && filteredOptions.length === 0 && (
              <div className="text-muted-foreground px-2 py-6 text-center text-sm">{emptyPlaceholder}</div>
            )}

            {filteredOptions.map((option, index) => {
              const isHighlighted = index === highlightedIndex
              const isSelected = option.value === selectedValue
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  data-highlighted={isHighlighted ? "true" : undefined}
                  ref={(node) => {
                    if (node) itemRefs.current.set(index, node)
                    else itemRefs.current.delete(index)
                  }}
                  onPointerEnter={() => setHighlightedIndex(index)}
                  onClick={() => chooseOption(option)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                    isHighlighted && "bg-accent text-accent-foreground",
                    isSelected && "font-medium"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  <CheckIcon className={cn("size-4 shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                </button>
              )
            })}
          </div>

          <div className="border-t bg-muted px-2.5 py-1.5">
            <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
              <span className="rounded border bg-background px-1">Up/Down</span>
              <span>Navigate</span>
              <span className="rounded border bg-background px-1">Enter</span>
              <span>Select</span>
              <span className="rounded border bg-background px-1">Esc</span>
              <span>Close</span>
            </div>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}