import { FabricDetail, FurnitureDetail, Stock } from "@/lib/types";

export type OrderItem = (FabricDetail | FurnitureDetail) & {
  type: "Fabric" | "Furniture";
};

export type ItemStatus =
  | { kind: "loading" }
  | { kind: "invalid" }
  | {
      kind: "invoiced";
      tallyNo: string;
      zohoInvoiceId?: string;
      zohoInvoiceNo?: string;
      invoiceDocId?: string;
    }
  | { kind: "allocated" }
  | { kind: "in_stock" }
  | { kind: "pr_created" }
  | { kind: "po_generated"; poNumber: string }
  | { kind: "pending_po" };

export type ResolvedOrderItem = {
  item: OrderItem;
  index: number;
  stock: Stock | null;
  allocatedQty: number;
  imsQty: number | null;
  imsDate: string | null;
  status: ItemStatus;
};

export type AllocationLabelItem = {
  bcn: string;
  itemName: string;
  qty: number;
  unit: string;
};
