type PlanLike = {
  id?: string;
  jobId?: string;
  plannedStart?: string;
  plannedEnd?: string;
  [key: string]: unknown;
};

const toPlanTime = (plan?: PlanLike) => {
  const raw = plan?.plannedEnd || plan?.plannedStart;
  const millis = raw ? new Date(String(raw)).getTime() : 0;
  return Number.isFinite(millis) ? millis : 0;
};

const isCanonicalPlanId = (plan: PlanLike, jobId: string) =>
  String(plan?.id || "").trim() === jobId;

const shouldReplacePlan = (current: PlanLike | undefined, next: PlanLike, jobId: string) => {
  if (!current) return true;

  const currentTime = toPlanTime(current);
  const nextTime = toPlanTime(next);
  if (nextTime !== currentTime) return nextTime > currentTime;

  return isCanonicalPlanId(next, jobId) && !isCanonicalPlanId(current, jobId);
};

export const getCanonicalPlans = <T extends PlanLike>(plans: T[]) => {
  const latestSourceByJobId = new Map<string, T>();

  for (const rawPlan of plans || []) {
    const jobId = String(rawPlan?.jobId || "").trim();
    if (!jobId) continue;

    const current = latestSourceByJobId.get(jobId);
    if (shouldReplacePlan(current, rawPlan, jobId)) {
      latestSourceByJobId.set(jobId, rawPlan);
    }
  }

  const canonicalByJobId = new Map<string, T>();
  latestSourceByJobId.forEach((plan, jobId) => {
    canonicalByJobId.set(jobId, {
      ...plan,
      jobId,
      id: jobId,
    } as T);
  });

  const stalePlanIds = Array.from(
    new Set(
      (plans || []).flatMap((rawPlan) => {
        const jobId = String(rawPlan?.jobId || "").trim();
        const planId = String(rawPlan?.id || "").trim();
        if (!jobId || !planId) return [];

        const keepId = canonicalByJobId.get(jobId)?.id || jobId;
        return planId === keepId ? [] : [planId];
      })
    )
  );

  return {
    plans: Array.from(canonicalByJobId.values()),
    latestSourceByJobId,
    canonicalByJobId,
    stalePlanIds,
  };
};
