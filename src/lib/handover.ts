import {
  AssignmentEnvelope,
  AssignmentReason,
  HandoverRequest,
  HandoverScopeType,
  HandoverStatus,
  OwnerAvailability,
  OwnerAvailabilityStatus,
  OwnerRef,
} from "./types";

type NowGetter = () => string;

type RoutingInput = {
  primaryOwner: OwnerRef;
  availability: OwnerAvailability[];
  handovers: HandoverRequest[];
  teamPool?: OwnerAvailability[]; // fallback pool of same role/team ordered by load externally
  managerFallback?: OwnerRef; // last-resort queue
  now?: NowGetter;
};

type ActiveHandover = HandoverRequest & { toOwner: OwnerRef };

const isWithinWindow = (handover: HandoverRequest, nowIso: string) => {
  const nowMs = Date.parse(nowIso);
  const startMs = Date.parse(handover.startAt);
  const endMs = handover.endAt ? Date.parse(handover.endAt) : null;
  return nowMs >= startMs && (endMs === null || nowMs <= endMs);
};

const findAvailability = (owner: OwnerRef, list: OwnerAvailability[]) =>
  list.find((entry) => entry.owner.type === owner.type && entry.owner.id === owner.id);

const isAccepted = (status: HandoverStatus) => status === "ACCEPTED";

const pickAcceptedHandover = (
  owner: OwnerRef,
  handovers: HandoverRequest[],
  nowIso: string
): ActiveHandover | undefined =>
  handovers.find(
    (h) =>
      isAccepted(h.status) &&
      h.fromOwner.type === owner.type &&
      h.fromOwner.id === owner.id &&
      isWithinWindow(h, nowIso)
  ) as ActiveHandover | undefined;

const isAvailable = (status?: OwnerAvailabilityStatus) => status === "AVAILABLE";

export function computeAssignment({
  primaryOwner,
  availability,
  handovers,
  teamPool = [],
  managerFallback,
  now = () => new Date().toISOString(),
}: RoutingInput): AssignmentEnvelope {
  const nowIso = now();
  const activeHandover = pickAcceptedHandover(primaryOwner, handovers, nowIso);

  if (activeHandover) {
    return {
      originalOwner: primaryOwner,
      assignedOwner: activeHandover.toOwner,
      assignmentReason: "HANDOVER",
      handoverRequestId: activeHandover.id,
      assignedAt: nowIso,
    };
  }

  const primaryAvailability = findAvailability(primaryOwner, availability);
  const primaryAvailable = isAvailable(primaryAvailability?.status);

  if (primaryAvailable) {
    return {
      originalOwner: primaryOwner,
      assignedOwner: primaryOwner,
      assignmentReason: "NORMAL",
      handoverRequestId: null,
      assignedAt: nowIso,
    };
  }

  // If primary unavailable, attempt emergency routing
  if (primaryAvailability?.backupOwnerId) {
    const backup = availability.find(
      (entry) =>
        entry.owner.id === primaryAvailability.backupOwnerId &&
        entry.owner.type === primaryOwner.type &&
        isAvailable(entry.status)
    );
    if (backup) {
      return {
        originalOwner: primaryOwner,
        assignedOwner: backup.owner,
        assignmentReason: "EMERGENCY",
        handoverRequestId: null,
        assignedAt: nowIso,
      };
    }
  }

  const poolCandidate = teamPool.find((entry) => isAvailable(entry.status));
  if (poolCandidate) {
    return {
      originalOwner: primaryOwner,
      assignedOwner: poolCandidate.owner,
      assignmentReason: "EMERGENCY",
      handoverRequestId: null,
      assignedAt: nowIso,
    };
  }

  if (managerFallback) {
    return {
      originalOwner: primaryOwner,
      assignedOwner: managerFallback,
      assignmentReason: "EMERGENCY",
      handoverRequestId: null,
      assignedAt: nowIso,
    };
  }

  // Fallback: keep with primary, but mark emergency for visibility
  return {
    originalOwner: primaryOwner,
    assignedOwner: primaryOwner,
    assignmentReason: "EMERGENCY",
    handoverRequestId: null,
    assignedAt: nowIso,
  };
}

// Utility to filter handovers by scope for CHILD_OWNERS use-cases (e.g., CRM -> Salesmen)
export const handoversForChildOwner = (
  child: OwnerRef,
  handovers: HandoverRequest[],
  nowIso = new Date().toISOString()
): ActiveHandover | undefined =>
  handovers.find(
    (h) =>
      isAccepted(h.status) &&
      h.scopeType === ("CHILD_OWNERS" as HandoverScopeType) &&
      h.childOwnerType === child.type &&
      (h.childOwnerIds || []).includes(child.id) &&
      isWithinWindow(h, nowIso)
  ) as ActiveHandover | undefined;
