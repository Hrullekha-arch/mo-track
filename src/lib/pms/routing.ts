export type RoutingStep = {
  id?: string;
  productId: string;
  stepNo: number;
  process: string;
  cycleMinutes: number;
  ops: number;
};

export type EmbellishmentWorkPayload = {
  enabled?: boolean;
  customerName?: string;
  customerPhone?: string;
  numberOfWindows?: number;
  numberOfPanels?: number;
  embellishmentBarcode?: string;
  stitchingPerPanel?: number;
  handWorkTime?: number;
  totalHours?: number;
  totalTime?: number;
  hourlyCharge?: number;
  chargeAmount?: number;
};

type BuildJobsOptions = {
  priority?: number;
  embellishment?: EmbellishmentWorkPayload;
};

const EMBELLISHMENT_PROCESS_KEYS = new Set([
  "embelshment work",
  "embelishment work",
  "embellishment work",
]);

const isEmbellishmentProcess = (process?: string) =>
  EMBELLISHMENT_PROCESS_KEYS.has(
    String(process || "")
      .trim()
      .toLowerCase()
  );

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
  priorityOrOptions?: number | BuildJobsOptions
) => {
  const options: BuildJobsOptions =
    typeof priorityOrOptions === "number"
      ? { priority: priorityOrOptions }
      : priorityOrOptions || {};
  const safePriority = Number.isFinite(options.priority as number)
    ? (options.priority as number)
    : undefined;
  const embellishment = options.embellishment?.enabled ? options.embellishment : undefined;
  const jobGroupId = `${orderId}_${productId}`;
  return normalizeRoutingSteps(routingSteps).map((step) => {
    const computedMinutes = computeRequiredMinutes(step.cycleMinutes, qty, step.ops);
    const embellishmentMinutes = Number(embellishment?.totalTime || 0);
    const requiredMinutes =
      embellishment &&
      isEmbellishmentProcess(step.process) &&
      Number.isFinite(embellishmentMinutes) &&
      embellishmentMinutes > 0
        ? embellishmentMinutes
        : computedMinutes;
    const baseJob = {
      id: `${orderId}_${productId}_${step.stepNo}`,
      orderId,
      jobGroupId,
      productId,
      stepNo: step.stepNo,
      process: step.process,
      requiredMinutes,
      status: "WAITING" as const,
      ...(embellishment && isEmbellishmentProcess(step.process)
        ? { embellishment }
        : {}),
    };
    return safePriority === undefined ? baseJob : { ...baseJob, priority: safePriority };
  });
};
