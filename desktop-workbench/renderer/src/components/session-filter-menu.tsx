"use client"

import * as React from "react"
import { CheckCheck, MoreHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { defaultFilter, type FilterValue } from "@/lib/demo-api"
import { useWorkspace } from "@/components/workspace-context"
import { useTranslations } from "next-intl"
import { runtimeLabel } from "@/components/session/session-utils"

export function SessionFilterMenu({
  onMarkAllRead,
  ariaLabel,
  className,
}: {
  onMarkAllRead?: () => void | Promise<void>
  ariaLabel?: string
  className?: string
}) {
  const { filter } = useWorkspace()
  const t = useTranslations("dashboard")
  const [open, setOpen] = React.useState(false)

  const active = filter.connectorId !== "all" || filter.runtime !== "all"

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel ?? t("actions.more")}
          title={ariaLabel ?? t("actions.more")}
          className={cn(
            "size-6 rounded-md p-0",
            active ? "text-foreground" : "text-sidebar-foreground/60",
            className,
          )}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56"
      >
        <SessionFilterMenuItems onMarkAllRead={onMarkAllRead} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SessionFilterMenuItems({
  onMarkAllRead,
}: {
  onMarkAllRead?: () => void | Promise<void>
}) {
  const { filter, setFilter, connectors, sessions } = useWorkspace()
  const t = useTranslations("dashboard")
  const active = filter.connectorId !== "all" || filter.runtime !== "all"
  const update = (patch: Partial<FilterValue>) => setFilter({ ...filter, ...patch })
  const runtimes = React.useMemo(
    () => Array.from(new Set(sessions.map((s) => s.runtime))).sort(),
    [sessions],
  )

  return (
    <>
      <FilterSection
        label={t("filters.devices")}
        options={[
          { value: "all", label: t("filters.allDevices") },
          ...connectors.map((c) => ({ value: c.id, label: c.name })),
        ]}
        value={filter.connectorId}
        onSelect={(v) => update({ connectorId: v })}
      />
      <DropdownMenuSeparator />
      <FilterSection
        label={t("filters.agents")}
        options={[
          { value: "all", label: t("filters.allAgents") },
          ...runtimes.map((runtime) => ({ value: runtime, label: runtimeLabel(runtime) })),
        ]}
        value={filter.runtime}
        onSelect={(v) => update({ runtime: v })}
      />
      {active || onMarkAllRead ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {onMarkAllRead ? (
              <DropdownMenuItem onSelect={() => void onMarkAllRead()}>
                <CheckCheck />
                {t("actions.markAllRead")}
              </DropdownMenuItem>
            ) : null}
            {active ? (
              <DropdownMenuItem onSelect={() => setFilter(defaultFilter)}>
                {t("filters.clear")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
        </>
      ) : null}
    </>
  )
}

function FilterSection({
  label,
  options,
  value,
  onSelect,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onSelect: (value: string) => void
}) {
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={onSelect}>
      {options.map((opt) => (
        <DropdownMenuRadioItem
          key={opt.value}
          value={opt.value}
        >
          <span className="truncate">{opt.label}</span>
        </DropdownMenuRadioItem>
      ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
