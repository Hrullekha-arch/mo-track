import {
  getMilestonesForOrder,
  MILESTONES_CONFIG,
  ORDER_TYPE_MILESTONES,
} from "@/lib/constants";
import {
  Milestone,
  Order,
  OrderType,
  OrderWorkflow,
  OrderWorkflowMilestone,
  OrderWorkflowStatus,
} from "@/lib/types";

export type WorkflowActor = { id?: string; name?: string };

export const ORDER_MILESTONE_KEY_MAP: Record<number, string> = {
  1: "ORDER_RECEIVED",
  2: "FABRIC_ALLOCATED",
  3: "SENT_TO_STITCHING",
  4: "STITCHING_DONE",
  5: "READY_FOR_DELIVERY",
  6: "INSTALLATION_SCHEDULED",
  7: "OUT_FOR_DELIVERY_INSTALLATION",
  8: "INSTALLATION_DONE",
};

export const ORDER_KEY_TO_MILESTONE_ID: Record<string, number> = Object.entries(
  ORDER_MILESTONE_KEY_MAP
).reduce<Record<string, number>>((acc, [id, key]) => {
  acc[key] = Number(id);
  return acc;
}, {});

const WORKFLOW_STATUS_BY_MILESTONE: Partial<Record<number, OrderWorkflowStatus>> = {
  1: "CREATED",
  2: "ALLOCATED",
  3: "IN_PRODUCTION",
  4: "IN_PRODUCTION",
  5: "READY",
  6: "READY",
  7: "DISPATCHED",
  8: "COMPLETED",
};

const WORKFLOW_STATUS_FALLBACK_LABEL: Record<OrderWorkflowStatus, string> = {
  CREATED: "ORDER RECEIVED",
  ALLOCATING: "FABRIC ALLOCATED",
  ALLOCATED: "FABRIC ALLOCATED",
  IN_PRODUCTION: "IN PRODUCTION",
  READY: "READY FOR DELIVERY",
  DISPATCHED: "OUT FOR DELIVERY/INSTALLATION",
  COMPLETED: "INSTALLATION DONE",
  CANCELLED: "CANCELLED",
};

const normalizeOrderType = (orderType?: string): OrderType => {
  if (orderType === "delivery" || orderType === "stitching" || orderType === "stitching+installation") {
    return orderType;
  }
  return "delivery";
};

const getMilestoneIdsForOrderType = (orderType?: string) => {
  const normalizedType = normalizeOrderType(orderType);
  return ORDER_TYPE_MILESTONES[normalizedType] || ORDER_TYPE_MILESTONES.delivery;
};

const getMilestoneName = (id: number) => MILESTONES_CONFIG[id]?.name || `Step ${id}`;

const isWorkflowMilestoneDone = (status?: string) => status === "DONE" || status === "SKIPPED";

const toDefinedString = (value?: string | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const sanitizeActor = (actor?: WorkflowActor | null) => {
  if (!actor) return undefined;
  const id = toDefinedString(actor.id);
  const name = toDefinedString(actor.name);
  if (!id && !name) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
  };
};

const toMilestoneDate = (value?: string | null) => {
  if (!value) return null;
  return value;
};

const cloneMilestone = (milestone: Milestone): Milestone => ({
  ...milestone,
  location: milestone.location ? { ...milestone.location } : null,
});

const getLegacyMilestoneMap = (orderType: string | undefined, milestones?: Milestone[]) => {
  const ids = getMilestoneIdsForOrderType(orderType);
  const base = Array.isArray(milestones) && milestones.length
    ? milestones.map(cloneMilestone)
    : getMilestonesForOrder(normalizeOrderType(orderType));

  const map = new Map<number, Milestone>();
  base.forEach((milestone) => {
    map.set(milestone.id, cloneMilestone(milestone));
  });

  ids.forEach((id) => {
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: getMilestoneName(id),
        completed: false,
        completedAt: null,
        completedBy: null,
        location: null,
      });
    }
  });

  return map;
};

export const buildWorkflowMilestones = (
  orderType: OrderType,
  actor: WorkflowActor = {},
  nowIso = new Date().toISOString()
): OrderWorkflowMilestone[] => {
  const ids = getMilestoneIdsForOrderType(orderType);
  return ids.map((id, index) => {
    const milestone: OrderWorkflowMilestone = {
      key: ORDER_MILESTONE_KEY_MAP[id] || `MILESTONE_${id}`,
      label: getMilestoneName(id),
      status: index === 0 ? "DONE" : "PENDING",
    };

    if (index === 0) {
      milestone.at = nowIso;
      const by = sanitizeActor(actor);
      if (by) milestone.by = by;
    }

    return milestone;
  });
};

export const getNormalizedOrderMilestones = (
  order: Pick<Order, "orderType" | "milestones" | "workflow">
): Milestone[] => {
  const ids = getMilestoneIdsForOrderType(order.orderType);
  const legacyMap = getLegacyMilestoneMap(order.orderType, order.milestones);
  const workflowMap = new Map(
    Array.isArray(order.workflow?.milestones)
      ? order.workflow!.milestones.map((milestone) => [milestone.key, milestone] as const)
      : []
  );

  return ids.map((id) => {
    const key = ORDER_MILESTONE_KEY_MAP[id] || `MILESTONE_${id}`;
    const workflowMilestone = workflowMap.get(key);
    const fallback = legacyMap.get(id)!;
    const done = workflowMilestone
      ? isWorkflowMilestoneDone(workflowMilestone.status)
      : Boolean(fallback.completed);

    return {
      id,
      name: fallback.name || getMilestoneName(id),
      completed: done,
      completedAt: done
        ? toMilestoneDate(workflowMilestone?.at) ?? toMilestoneDate(fallback.completedAt) ?? null
        : null,
      completedBy: done
        ? workflowMilestone?.by?.name ?? fallback.completedBy ?? null
        : null,
      location: done ? fallback.location ?? null : null,
    };
  });
};

export const deriveWorkflowStatusFromMilestones = (
  milestones: Milestone[],
  existingStatus?: OrderWorkflowStatus
): OrderWorkflowStatus => {
  if (existingStatus === "CANCELLED") return "CANCELLED";

  const completed = new Set(
    milestones.filter((milestone) => milestone.completed).map((milestone) => milestone.id)
  );

  let derived: OrderWorkflowStatus = "CREATED";
  if (completed.has(8)) derived = "COMPLETED";
  else if (completed.has(7)) derived = "DISPATCHED";
  else if (completed.has(6) || completed.has(5)) derived = "READY";
  else if (completed.has(4) || completed.has(3)) derived = "IN_PRODUCTION";
  else if (completed.has(2)) derived = "ALLOCATED";

  if (existingStatus === "ALLOCATING" && (derived === "CREATED" || derived === "ALLOCATED")) {
    return "ALLOCATING";
  }

  return derived;
};

export const buildWorkflowFromLegacyMilestones = (
  orderType: OrderType,
  milestones: Milestone[],
  existingWorkflow?: OrderWorkflow,
  forceStatus?: OrderWorkflowStatus
): OrderWorkflow => {
  const ids = getMilestoneIdsForOrderType(orderType);
  const existingMap = new Map(
    Array.isArray(existingWorkflow?.milestones)
      ? existingWorkflow!.milestones.map((milestone) => [milestone.key, milestone] as const)
      : []
  );
  const milestoneMap = new Map(milestones.map((milestone) => [milestone.id, milestone] as const));

  const workflowMilestones = ids.map((id) => {
    const key = ORDER_MILESTONE_KEY_MAP[id] || `MILESTONE_${id}`;
    const existing = existingMap.get(key);
    const legacy = milestoneMap.get(id);
    const done = Boolean(legacy?.completed);
    const status = done
      ? existing?.status === "SKIPPED"
        ? "SKIPPED"
        : "DONE"
      : "PENDING";

    const milestone: OrderWorkflowMilestone = {
      key,
      label: existing?.label || legacy?.name || getMilestoneName(id),
      status,
    };

    if (done) {
      const at = toDefinedString(legacy?.completedAt) ?? toDefinedString(existing?.at);
      if (at) milestone.at = at;

      const byFromWorkflow = sanitizeActor(existing?.by);
      const byFromLegacy = legacy?.completedBy
        ? sanitizeActor({ name: legacy.completedBy })
        : undefined;
      const by = byFromWorkflow ?? byFromLegacy;
      if (by) milestone.by = by;
    }

    const note = toDefinedString(existing?.note);
    if (note) milestone.note = note;

    return milestone;
  });

  const status =
    forceStatus ??
    deriveWorkflowStatusFromMilestones(
      milestones,
      existingWorkflow?.status
    );

  return {
    status,
    milestones: workflowMilestones,
  };
};

export const getNormalizedOrderWorkflow = (
  order: Pick<Order, "orderType" | "milestones" | "workflow">
): OrderWorkflow => {
  const orderType = normalizeOrderType(order.orderType);
  const normalizedMilestones = getNormalizedOrderMilestones(order);
  return buildWorkflowFromLegacyMilestones(
    orderType,
    normalizedMilestones,
    order.workflow
  );
};

export const applyOrderMilestoneChange = (
  order: Pick<Order, "orderType" | "milestones" | "workflow">,
  milestoneId: number,
  completed: boolean,
  actor: WorkflowActor = {},
  completedAt = new Date().toISOString()
): { milestones: Milestone[]; workflow: OrderWorkflow } => {
  const orderType = normalizeOrderType(order.orderType);
  const ids = getMilestoneIdsForOrderType(orderType);
  const targetIndex = ids.findIndex((id) => id === milestoneId);

  const milestones = getNormalizedOrderMilestones(order).map((milestone) => {
    if (milestone.id !== milestoneId) return milestone;
    return {
      ...milestone,
      completed,
      completedAt: completed ? completedAt : null,
      completedBy: completed ? actor.name ?? null : null,
      location: completed ? milestone.location ?? null : null,
    };
  });

  if (!completed && targetIndex >= 0) {
    for (let index = targetIndex + 1; index < ids.length; index += 1) {
      const id = ids[index];
      const milestoneIndex = milestones.findIndex((milestone) => milestone.id === id);
      if (milestoneIndex === -1) continue;
      milestones[milestoneIndex] = {
        ...milestones[milestoneIndex],
        completed: false,
        completedAt: null,
        completedBy: null,
        location: null,
      };
    }
  }

  const workflow = buildWorkflowFromLegacyMilestones(
    orderType,
    milestones,
    order.workflow
  );

  return { milestones, workflow };
};

export const getOrderStatusLabel = (
  order: Pick<Order, "status" | "orderType" | "milestones" | "workflow">
): string => {
  const milestones = getNormalizedOrderMilestones(order);
  const lastCompleted = [...milestones].reverse().find((milestone) => milestone.completed);
  if (lastCompleted?.name) return String(lastCompleted.name).toUpperCase();

  if (order.status === "Pending Approval") return "PENDING APPROVAL";

  const workflowStatus = getNormalizedOrderWorkflow(order).status;
  return WORKFLOW_STATUS_FALLBACK_LABEL[workflowStatus] || String(workflowStatus).replace(/_/g, " ");
};

export const isOrderComplete = (
  order: Pick<Order, "orderType" | "milestones" | "workflow">
): boolean => {
  const milestones = getNormalizedOrderMilestones(order);
  return milestones.length > 0 && milestones.every((milestone) => milestone.completed);
};
