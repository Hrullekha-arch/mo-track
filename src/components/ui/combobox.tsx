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
  popoverModal?: boolean
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
    const elementProps = node.props as { children?: React.ReactNode }
    return getSearchableText(elementProps.children)
  }

  return ""
}

function normalizeOption(option: ComboboxOption): NormalizedOption {
  const value = String(option?.value ?? "")
  const label = option?.label ?? value
  const labelText = getSearchableText(label) || value

  return {
    ...option,
    value,
    label,
    labelText,
  }
}

function findSelectedOption(
  options: NormalizedOption[],
  selectedValue: string
): NormalizedOption | undefined {
  if (!selectedValue) return undefined

  return (
    options.find((option) => option.value === selectedValue) ||
    options.find(
      (option) => option.value.toLowerCase() === selectedValue.toLowerCase()
    )
  )
}

function Combobox({
  options,
  value,
  onSelect,
  onSearch,
  placeholder = "Select an option...",
  searchPlaceholder,
  emptyPlaceholder = "No items found.",
  popoverModal = false,
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
  const anchorRef = React.useRef<HTMLDivElement | null>(null)
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const searchRequestRef = React.useRef(0)

  const listId = React.useId()

  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
  const [isSearching, setIsSearching] = React.useState(false)
  const [dropdownWidth, setDropdownWidth] = React.useState<number | undefined>()

  const normalizedOptions = React.useMemo(
    () => (options ?? []).map(normalizeOption),
    [options]
  )

  const selectedValue = typeof value === "string" ? value : ""
  const selectedOption = React.useMemo(
    () => findSelectedOption(normalizedOptions, selectedValue),
    [normalizedOptions, selectedValue]
  )
  const selectedLabel = selectedOption?.labelText ?? selectedValue

  const filteredOptions = React.useMemo(() => {
    const query = inputValue.trim().toLowerCase()
    if (onSearch || !query) {
      return normalizedOptions
    }

    return normalizedOptions.filter((option) => {
      return (
        option.labelText.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query)
      )
    })
  }, [inputValue, normalizedOptions, onSearch])

  const focusInput = React.useCallback(() => {
    const input = anchorRef.current?.querySelector<HTMLInputElement>(
      'input[data-slot="combobox-input"]'
    )

    if (!input) return

    input.focus({ preventScroll: true })
    const caretPosition = input.value.length

    try {
      input.setSelectionRange(caretPosition, caretPosition)
    } catch {
      // Some browser/input combinations do not support selection APIs.
    }
  }, [])

  const runSearch = React.useCallback(
    (query: string) => {
      if (!onSearch) {
        setIsSearching(false)
        return
      }

      const requestId = ++searchRequestRef.current

      try {
        const maybePromise = onSearch(query)

        if (
          maybePromise &&
          typeof (maybePromise as Promise<unknown>).then === "function"
        ) {
          setIsSearching(true)

          Promise.resolve(maybePromise)
            .catch(() => {
              // Errors are handled where onSearch is implemented.
            })
            .finally(() => {
              if (searchRequestRef.current === requestId) {
                setIsSearching(false)
              }
            })
        } else if (searchRequestRef.current === requestId) {
          setIsSearching(false)
        }
      } catch {
        if (searchRequestRef.current === requestId) {
          setIsSearching(false)
        }
      }
    },
    [onSearch]
  )

  const closeDropdown = React.useCallback(() => {
    setOpen(false)
    setHighlightedIndex(-1)
    setIsSearching(false)
    setInputValue(selectedLabel)
  }, [selectedLabel])

  const chooseOption = React.useCallback(
    (option: NormalizedOption) => {
      const nextValue = option.value === selectedValue ? "" : option.value

      onSelect?.(nextValue)
      setInputValue(nextValue ? option.labelText : "")
      setOpen(false)
      setHighlightedIndex(-1)
    },
    [onSelect, selectedValue]
  )

  const handleClear = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      onSelect?.("")
      setInputValue("")
      setOpen(false)
      setHighlightedIndex(-1)
      setIsSearching(false)
      runSearch("")

      window.requestAnimationFrame(focusInput)
    },
    [focusInput, onSelect, runSearch]
  )

  const handleInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const query = event.target.value
      setInputValue(query)

      if (!open) {
        setOpen(true)
      }

      setHighlightedIndex(0)
      runSearch(query)
    },
    [open, runSearch]
  )

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault()

        if (!open) {
          setOpen(true)
          return
        }

        setHighlightedIndex((previousIndex) => {
          if (filteredOptions.length === 0) return -1
          if (previousIndex < 0) return 0
          return (previousIndex + 1) % filteredOptions.length
        })

        return
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()

        if (!open) {
          setOpen(true)
          return
        }

        setHighlightedIndex((previousIndex) => {
          if (filteredOptions.length === 0) return -1
          if (previousIndex < 0) return filteredOptions.length - 1
          return (previousIndex - 1 + filteredOptions.length) % filteredOptions.length
        })

        return
      }

      if (event.key === "Enter") {
        if (!open) return

        event.preventDefault()
        const optionToSelect =
          filteredOptions[highlightedIndex] ?? filteredOptions[0]

        if (optionToSelect) {
          chooseOption(optionToSelect)
        }

        return
      }

      if (event.key === "Escape") {
        if (!open) return

        event.preventDefault()
        closeDropdown()
        return
      }

      if (event.key === "Tab") {
        setOpen(false)
      }
    },
    [
      chooseOption,
      closeDropdown,
      filteredOptions,
      highlightedIndex,
      open,
    ]
  )

  const handleToggleOpen = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (disabled) return

      setOpen((previousOpen) => {
        const nextOpen = !previousOpen

        if (nextOpen) {
          window.requestAnimationFrame(focusInput)
        }

        return nextOpen
      })
    },
    [disabled, focusInput]
  )

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (disabled) return

      setOpen(nextOpen)

      if (nextOpen) {
        window.requestAnimationFrame(focusInput)
      }
    },
    [disabled, focusInput]
  )

  React.useEffect(() => {
    if (open) {
      const selectedIndex = filteredOptions.findIndex(
        (option) => option.value === selectedValue
      )

      setHighlightedIndex(
        selectedIndex >= 0 ? selectedIndex : filteredOptions.length > 0 ? 0 : -1
      )
      return
    }

    setHighlightedIndex(-1)
    setInputValue(selectedLabel)
  }, [filteredOptions, open, selectedLabel, selectedValue])

  React.useEffect(() => {
    if (!open || highlightedIndex < 0) return

    itemRefs.current[highlightedIndex]?.scrollIntoView({
      block: "nearest",
    })
  }, [highlightedIndex, open])

  React.useEffect(() => {
    if (!anchorRef.current) return

    const updateWidth = () => {
      setDropdownWidth(anchorRef.current?.offsetWidth)
    }

    updateWidth()

    if (typeof ResizeObserver === "undefined") {
      return
    }

    const observer = new ResizeObserver(updateWidth)
    observer.observe(anchorRef.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  const showClearButton =
    showClear && !disabled && (Boolean(selectedValue) || Boolean(inputValue))

  const resolvedPlaceholder = searchPlaceholder || placeholder

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={handleOpenChange}
      modal={popoverModal}
    >
      <PopoverPrimitive.Anchor asChild>
        <div ref={anchorRef} className="w-full">
          <InputGroup
            className={cn(
              "w-full border-input/70 bg-background/95 shadow-xs transition-[border,box-shadow] duration-150",
              open && "border-primary/50 ring-2 ring-primary/15",
              className
            )}
          >
            <InputGroupAddon align="inline-start" className="text-muted-foreground">
              <SearchIcon className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
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
              onFocus={() => {
                if (!disabled) setOpen(true)
              }}
              onClick={() => {
                if (!disabled) setOpen(true)
              }}
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
              >
                <ChevronDownIcon
                  className={cn(
                    "size-4 transition-transform duration-200",
                    open && "rotate-180"
                  )}
                />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {name ? (
            <input type="hidden" name={name} value={selectedValue} required={required} />
          ) : null}
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={8}
          collisionPadding={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className={cn(
            "z-50 overflow-hidden rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            contentClassName
          )}
          style={dropdownWidth ? { width: dropdownWidth } : undefined}
        >
          <div id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1">
            {isSearching && (
              <div className="text-muted-foreground flex items-center gap-2 rounded-md px-2 py-2 text-xs">
                <Loader2Icon className="size-3.5 animate-spin" />
                Searching...
              </div>
            )}

            {!isSearching && filteredOptions.length === 0 && (
              <div className="text-muted-foreground px-2 py-3 text-center text-sm">
                {emptyPlaceholder}
              </div>
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
                  data-highlighted={isHighlighted ? "true" : undefined}
                  ref={(node) => {
                    itemRefs.current[index] = node
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={() => chooseOption(option)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isHighlighted && "bg-accent text-accent-foreground",
                    isSelected && "font-medium"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  <CheckIcon
                    className={cn(
                      "size-4 shrink-0 text-primary transition-opacity",
                      isSelected ? "opacity-100" : "opacity-0"
                    )}
                  />
                </button>
              )
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { Combobox }
