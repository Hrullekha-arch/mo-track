import * as React from "react";
import { Order, Stock, PurchaseRequest, Invoice } from "@/lib/types";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getStockById } from "@/app/dashboard/inventory/actions";
import {
  ResolvedOrderItem,
  ItemStatus,
} from "@/types/order-items";
import {
  aggregateItems,
  getBcnFromItem,
  getItemName,
  getItemQty,
  normalizeItemKey,
} from "@/lib/order-utils";

// Module-level IMS cache - survives component remounts
const IMS_SESSION_CACHE = new Map<
  string,
  { qty: number | null; date: string | null }
>();

// Module-level stock cache - reduces Firestore reads
const STOCK_CACHE = new Map<string, { stock: Stock | null; timestamp: number }>();
const STOCK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const yieldToMain = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * OPTIMIZED HOOK - Incremental refresh strategy
 * 
 * When lastAllocation changes:
 * - If bcn === "*" → full refresh
 * - If bcn is specific → only re-fetch that item's data
 * - Otherwise → no refresh
 */
export function useOrderItems(
  order: Order | null,
  orderId: string,
  lastAllocation: { bcn: string; timestamp: number } | null
) {
  const [resolvedItems, setResolvedItems] = React.useState<ResolvedOrderItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  
  // Track which items are currently being refreshed
  const [refreshingBcns, setRefreshingBcns] = React.useState<Set<string>>(
    new Set()
  );

  const prevAllocationRef = React.useRef(lastAllocation);

  React.useEffect(() => {
    if (!order) return;

    let cancelled = false;

    const run = async () => {
      const aggregated = aggregateItems(order);
      
      // Determine refresh strategy
      const isFullRefresh =
        !prevAllocationRef.current ||
        lastAllocation?.bcn === "*" ||
        lastAllocation?.timestamp !== prevAllocationRef.current?.timestamp;
      
      const targetBcn = !isFullRefresh ? lastAllocation?.bcn : null;

      if (isFullRefresh) {
        setIsLoading(true);
        // Show loading skeleton
        if (!cancelled) {
          setResolvedItems(
            aggregated.map((item, index) => ({
              item,
              index,
              stock: null,
              allocatedQty: 0,
              imsQty: null,
              imsDate: null,
              status: { kind: "loading" },
            }))
          );
        }
      } else if (targetBcn) {
        // Mark specific item as refreshing
        setRefreshingBcns((prev) => new Set(prev).add(targetBcn));
      }

      await yieldToMain();

      // Filter BCNs to fetch based on refresh strategy
      const uniqueBcns = Array.from(
        new Set(aggregated.map(getBcnFromItem).filter(Boolean))
      );
      
      const bcnsToFetch = targetBcn
        ? uniqueBcns.filter((bcn) => bcn === targetBcn)
        : uniqueBcns;

      if (bcnsToFetch.length === 0) return;

      // Fetch stock data (use cache for non-refreshing items)
      const stockMap = new Map<string, Stock | null>();
      await Promise.all(
        bcnsToFetch.map(async (bcn) => {
          const stockId = bcn.replace(/\//g, "-");
          
          // Check cache first
          const cached = STOCK_CACHE.get(stockId);
          const now = Date.now();
          if (cached && now - cached.timestamp < STOCK_CACHE_TTL && !targetBcn) {
            stockMap.set(bcn, cached.stock);
            return;
          }

          const stock = await getStockById(stockId);
          stockMap.set(bcn, stock);
          STOCK_CACHE.set(stockId, { stock, timestamp: now });
        })
      );

      await yieldToMain();

      // Fetch lengths + reservations
      const allocatedQtyMap = new Map<string, number>();
      const stockResolvedMap = new Map<string, Stock | null>();

      await Promise.all(
        bcnsToFetch.map(async (bcn) => {
          const stockId = bcn.replace(/\//g, "-");
          const stockRef = doc(db, "stocks", stockId);
          const lengthsRef = collection(stockRef, "lengths");
          const lengthsSnap = await getDocs(lengthsRef);

          let sumAvailable = 0;
          let sumReserved = 0;
          let totalReservedForOrder = 0;

          await Promise.all(
            lengthsSnap.docs.map(async (lengthDoc) => {
              const d = lengthDoc.data() as any;
              const available = Number(
                d?.availableLength ?? d?.availableQty ?? 0
              );
              const original = Number(d?.originalLength ?? d?.quantity ?? 0);
              const reserved = Number(d?.reservedQty);

              sumAvailable += Number.isFinite(available) ? available : 0;
              if (Number.isFinite(reserved)) {
                sumReserved += reserved;
              } else {
                const derived = original - available;
                sumReserved += derived > 0 ? derived : 0;
              }

              const resQuery = query(
                collection(lengthDoc.ref, "reservedQty"),
                where("orderId", "==", orderId)
              );
              const resSnap = await getDocs(resQuery);
              resSnap.forEach((r) => {
                totalReservedForOrder += r.data().reservedQty || 0;
              });
            })
          );

          allocatedQtyMap.set(bcn, totalReservedForOrder);

          const rawStock = stockMap.get(bcn) ?? null;
          if (rawStock) {
            const sa = Number(rawStock.availableQty);
            const sr = Number(rawStock.reservedQty);
            stockResolvedMap.set(bcn, {
              ...rawStock,
              availableQty:
                Number.isFinite(sa) && sa >= 0 ? sa : sumAvailable,
              reservedQty: Number.isFinite(sr) && sr >= 0 ? sr : sumReserved,
            });
          } else {
            stockResolvedMap.set(bcn, null);
          }
        })
      );

      // Fetch PO + Invoice (only on full refresh)
      let poDocs: any[] = [];
      let invoiceDocs: any[] = [];
      
      if (isFullRefresh) {
        const [poSnapshot, invoiceSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(db, "purchaseRequests"),
              where(
                "dealId",
                "==",
                order.crmOrderNo || order.dealId || order.id
              )
            )
          ),
          getDocs(
            query(collection(db, "invoices"), where("orderId", "==", orderId))
          ),
        ]);
        poDocs = poSnapshot.docs;
        invoiceDocs = invoiceSnapshot.docs;
      }

      await yieldToMain();

      // IMS lookups (skip if cached)
      const bcnsNeedingIms = bcnsToFetch.filter(
        (bcn) => !IMS_SESSION_CACHE.has(normalizeItemKey(bcn))
      );

      const hydrateImsInBackground = async () => {
        try {
          const res = await fetch("/api/ims-sheet/bulk", {
            method: "POST",
            cache: "default",
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "max-age=300",
            },
            body: JSON.stringify({ bcns: bcnsNeedingIms }),
          });

          if (!res.ok) {
            throw new Error(`IMS bulk fetch failed with status ${res.status}`);
          }

          const payload = await res.json();
          const items = Array.isArray(payload?.items) ? payload.items : [];
          const date =
            typeof payload?.date === "string" ? payload.date : null;

          const qtyByKey = new Map<string, number | null>();
          for (const entry of items) {
            const key = normalizeItemKey(entry?.bcn);
            if (!key) continue;
            const qty =
              typeof entry?.qty === "number" && Number.isFinite(entry.qty)
                ? entry.qty
                : null;
            qtyByKey.set(key, qty);
          }

          for (const bcn of bcnsNeedingIms) {
            const key = normalizeItemKey(bcn);
            IMS_SESSION_CACHE.set(key, {
              qty: qtyByKey.has(key) ? qtyByKey.get(key) ?? null : null,
              date,
            });
          }
        } catch {
          for (const bcn of bcnsNeedingIms) {
            IMS_SESSION_CACHE.set(normalizeItemKey(bcn), {
              qty: null,
              date: null,
            });
          }
        }

        if (cancelled) return;

        const keysToHydrate = new Set(
          bcnsNeedingIms.map((bcn) => normalizeItemKey(bcn))
        );

        setResolvedItems((prev) =>
          prev.map((row) => {
            const rowKey = normalizeItemKey(getBcnFromItem(row.item));
            if (!keysToHydrate.has(rowKey)) return row;

            const imsEntry = IMS_SESSION_CACHE.get(rowKey);
            const nextQty = imsEntry?.qty ?? null;
            const nextDate = imsEntry?.date ?? null;

            if (row.imsQty === nextQty && row.imsDate === nextDate) {
              return row;
            }

            return {
              ...row,
              imsQty: nextQty,
              imsDate: nextDate,
            };
          })
        );
      };

      if (cancelled) return;

      // Build resolved items
      const resolved: ResolvedOrderItem[] = aggregated.map((item, index) => {
        const bcn = getBcnFromItem(item);
        const itemName = getItemName(item);
        
        // If incremental refresh, keep old data for non-target items
        if (targetBcn && bcn !== targetBcn) {
          const existing = resolvedItems.find((r) => getBcnFromItem(r.item) === bcn);
          if (existing) return existing;
        }

        const stock = stockResolvedMap.get(bcn) ?? null;
        const allocated = allocatedQtyMap.get(bcn) ?? 0;
        const required = getItemQty(item);
        const imsEntry = IMS_SESSION_CACHE.get(normalizeItemKey(bcn));

        if (!bcn) {
          return {
            item,
            index,
            stock,
            allocatedQty: 0,
            imsQty: null,
            imsDate: null,
            status: { kind: "invalid" } as ItemStatus,
          };
        }

        let status: ItemStatus = { kind: "pending_po" };

        const matchedInvoice = invoiceDocs.find((d: any) => {
          const inv = d.data() as Invoice;
          const items =
            inv.sections?.NORMAL?.items || (inv as any).items || [];
          return items.some((i: any) => i.bcn === bcn);
        });

        if (matchedInvoice) {
          status = {
            kind: "invoiced",
            tallyNo: matchedInvoice.data().tallyVoucherNo || "",
          };
        } else if (allocated >= required) {
          status = { kind: "allocated" };
        } else {
          const available = Number.isFinite(Number(stock?.availableQty))
            ? Number(stock?.availableQty)
            : 0;
          if (available >= required - allocated) {
            status = { kind: "in_stock" };
          } else {
            let poFound = false;
            let prFound = false;
            for (const poDoc of poDocs) {
              const poData = poDoc.data() as PurchaseRequest;
              const poItem = poData.fabricDetails?.find(
                (pi) => pi.fabricName === itemName
              );
              if (poItem) {
                prFound = true;
              }
              if (poItem?.poNumber) {
                status = {
                  kind: "po_generated",
                  poNumber: poItem.poNumber,
                };
                poFound = true;
                break;
              }
            }
            if (!poFound) {
              status = prFound
                ? { kind: "pr_created" }
                : { kind: "pending_po" };
            }
          }
        }

        return {
          item,
          index,
          stock,
          allocatedQty: allocated,
          imsQty: imsEntry?.qty ?? null,
          imsDate: imsEntry?.date ?? null,
          status,
        };
      });

      setResolvedItems(resolved);
      setIsLoading(false);
      setRefreshingBcns(new Set());
      prevAllocationRef.current = lastAllocation;

      if (bcnsNeedingIms.length > 0) {
        void hydrateImsInBackground();
      }
    };

    run().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [order, orderId, lastAllocation]); // eslint-disable-line react-hooks/exhaustive-deps

  return { resolvedItems, isLoading, refreshingBcns };
}
