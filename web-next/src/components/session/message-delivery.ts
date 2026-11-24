import { isApiError } from "@/lib/api/errors"
import type { TimelineItem } from "@/features/dashboard/types"
import { isOptimisticTimelineItem, timelineClientMessageId } from "./optimistic-timeline"

export function messageWasConfirmed(items: TimelineItem[], clientMessageId: string): boolean {
  return items.some(item => !isOptimisticTimelineItem(item) && timelineClientMessageId(item) === clientMessageId)
}

export function messageDeliveryIsUncertain(error: unknown): boolean {
  return isApiError(error) && (
    error.kind === "network" ||
    error.status === 408 ||
    error.status >= 500 ||
    error.code?.endsWith("_outcome_unknown") === true
  )
}
