// =============================================================================
// usePmsLookups — Build all shared lookup maps once per data change
//
// Before: liveVasRowsAll, workDetailRows, workSheetStepRows each built
// their own Map instances for orders, machines, people, products, routing.
// This resulted in 15+ Maps rebuilt on EVERY state change.
//
// After: One hook, one useMemo, consumed everywhere.
// =============================================================================

import { useMemo } from "react";
import type {
  PmsMachine,
  PmsPerson,
  PmsPlan,
  PmsProduct,
  PmsRouting,
  PmsLookups,
} from "../types/pms";
import { buildLookups } from "../utils/pmsHelpers";
import { Order } from "@/lib/types";

export const usePmsLookups = (
  orders: Order[],
  machines: PmsMachine[],
  people: PmsPerson[],
  products: PmsProduct[],
  routing: PmsRouting[],
  plans: PmsPlan[]
): PmsLookups => {
  return useMemo(
    () => buildLookups(orders, machines, people, products, routing, plans),
    [orders, machines, people, products, routing, plans]
  );
};