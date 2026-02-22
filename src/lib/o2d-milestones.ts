import { O2DStatus } from "@/lib/types";

const toTime = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const dedupeO2DMilestones = (milestones: O2DStatus[] = []): O2DStatus[] => {
  const byStep = new Map<number, O2DStatus>();

  milestones.forEach((milestone) => {
    if (!milestone || typeof milestone.stepId !== "number") return;

    const existing = byStep.get(milestone.stepId);
    if (!existing) {
      byStep.set(milestone.stepId, milestone);
      return;
    }

    if (toTime(milestone.completedAt) >= toTime(existing.completedAt)) {
      byStep.set(milestone.stepId, milestone);
    }
  });

  return Array.from(byStep.values()).sort((a, b) => a.stepId - b.stepId);
};

export const upsertO2DMilestone = (
  milestones: O2DStatus[] = [],
  milestone: O2DStatus
): O2DStatus[] => {
  return dedupeO2DMilestones([
    ...milestones.filter((entry) => entry.stepId !== milestone.stepId),
    milestone,
  ]);
};

export const removeO2DMilestone = (
  milestones: O2DStatus[] = [],
  stepId: number
): O2DStatus[] => {
  return dedupeO2DMilestones(milestones.filter((entry) => entry.stepId !== stepId));
};
