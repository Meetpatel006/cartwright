"use client"

import { ChevronDown } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cartwright/ui/components/dropdown-menu"
import { cn } from "@cartwright/ui/lib/utils"

export type SelectMenuOption = { value: string | number; label: string }

export function SelectMenu({
  value,
  onChange,
  options,
  placeholder = "Select",
  className,
  size = "md",
}: {
  value: string | number
  onChange: (value: string) => void
  options: SelectMenuOption[]
  placeholder?: string
  className?: string
  size?: "sm" | "md"
}) {
  const selected = options.find((option) => String(option.value) === String(value))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex w-auto shrink-0 cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-lg border border-border bg-card text-xs font-medium text-foreground shadow-none transition-colors hover:bg-muted/80 focus:border-ring focus:outline-none",
              size === "sm" ? "h-7 px-2.5" : "h-9 px-3",
              className,
            )}
          >
            <span>{selected ? selected.label : placeholder}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="z-50 w-max min-w-full rounded-xl border border-border bg-popover p-1 text-xs text-popover-foreground shadow-none backdrop-blur-md"
      >
        <DropdownMenuGroup className="flex flex-col gap-y-0.5">
          {options.map((option) => {
            const isSelected = String(option.value) === String(value)

            return (
              <DropdownMenuItem
                key={String(option.value)}
                onClick={() => onChange(String(option.value))}
                className={cn(
                  "flex cursor-pointer items-center whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
                  isSelected
                    ? "bg-muted font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {option.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
