export type RoutingStep = {
  id?: string;
  productId: string;
  stepNo: number;
  process: string;
  cycleMinutes: number;
  ops: number;
};

export const computeRequiredMinutes = (
  cycleMinutes: number,
  qty: number,
  ops: number
) => {
  const safeCycle = Number.isFinite(cycleMinutes) ? cycleMinutes : 0;
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safeOps = Number.isFinite(ops) && ops > 0 ? ops : 1;
  return Math.ceil((safeCycle * safeQty) / safeOps);
};

export const normalizeRoutingSteps = (steps: RoutingStep[]) =>
  [...steps]
    .filter((step) => Number.isFinite(step.stepNo))
    .sort((a, b) => a.stepNo - b.stepNo);

export const buildJobsFromRouting = (
  orderId: string,
  productId: string,
  qty: number,
  routingSteps: RoutingStep[],
  priority?: number
) =>
  normalizeRoutingSteps(routingSteps).map((step) => ({
    id: `${orderId}_${step.stepNo}`,
    orderId,
    productId,
    stepNo: step.stepNo,
    process: step.process,
    requiredMinutes: computeRequiredMinutes(step.cycleMinutes, qty, step.ops),
    status: "WAITING" as const,
    priority,
  }));
