
"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  RowSelectionState,
} from "@tanstack/react-table";
import { ArrowUpDown, FileText, Loader2, Eye, Printer, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { collection, onSnapshot, query, orderBy, where, documentId, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Invoice, PrintableInvoicePayload } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableInvoice } from "@/components/features/invoice/PrintableInvoice";
import { buildPrintablePayloadFromInvoice } from "@/lib/invoice-utils";
import { canSyncInvoiceToZoho, isVasInvoice } from "@/lib/zoho-sync/invoice-eligibility";
import {
  DEFAULT_DESTINATION_STATE,
  DEFAULT_DESTINATION_STATE_CODE,
  getGstStateCodeFromAddress,
} from "@/lib/gst-jurisdiction";

const asTrimmedString = (value: unknown) => String(value ?? "").trim();

const chunkValues = (values: string[], chunkSize = 30): string[][] => {
  if (!values.length) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
};

type ZohoCustomerDraftAddress = {
  attention?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

type ZohoCustomerDraft = {
  invoiceId: string;
  contactName: string;
  companyName: string;
  email: string;
  phone: string;
  gstNo: string;
  placeOfContact: string;
  gstTreatment: "business_gst" | "business_none" | "consumer" | "overseas";
  notes: string;
  billingAddress: ZohoCustomerDraftAddress;
  shippingAddress: ZohoCustomerDraftAddress;
};

const GST_STATE_CODE_TO_PLACE_OF_CONTACT: Record<string, string> = {
  "01": "JK",
  "02": "HP",
  "03": "PB",
  "04": "CH",
  "05": "UK",
  "06": "HR",
  "07": "DL",
  "08": "RJ",
  "09": "UP",
  "10": "BR",
  "11": "SK",
  "12": "AR",
  "13": "NL",
  "14": "MN",
  "15": "MZ",
  "16": "TR",
  "17": "ML",
  "18": "AS",
  "19": "WB",
  "20": "JH",
  "21": "OD",
  "22": "CG",
  "23": "MP",
  "24": "GJ",
  "26": "DN",
  "27": "MH",
  "29": "KA",
  "30": "GA",
  "31": "LD",
  "32": "KL",
  "33": "TN",
  "34": "PY",
  "35": "AN",
  "36": "TS",
  "37": "AP",
  "38": "LA",
};

const resolvePlaceOfContactFromGstin = (gstNo: string): string | undefined => {
  const normalized = asTrimmedString(gstNo).toUpperCase();
  if (!normalized) return undefined;
  const stateCode = normalized.slice(0, 2);
  return GST_STATE_CODE_TO_PLACE_OF_CONTACT[stateCode];
};

const asAddressLine = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";

  const raw = value as Record<string, unknown>;
  const parts = [
    raw.address,
    raw.addressLine1,
    raw.addressLine2,
    raw.street,
    raw.locality,
    raw.landmark,
    raw.city,
    raw.state,
    raw.pincode,
    raw.zip,
  ]
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean);

  return Array.from(new Set(parts)).join(", ");
};

const splitContactName = (name: string) => {
  const normalized = asTrimmedString(name).replace(/\s+/g, " ");
  const [first = "", ...rest] = normalized.split(" ");
  return {
    firstName: first || "Customer",
    lastName: rest.join(" ").trim(),
  };
};

const buildZohoCustomerDraftFromInvoice = (invoice: Invoice): ZohoCustomerDraft => {
  const customerName = asTrimmedString(invoice.customerSnapshot?.name || invoice.customer?.name) || "Customer";
  const companyName = customerName;
  const phone =
    asTrimmedString((invoice.customerSnapshot as any)?.phone || (invoice.customer as any)?.phone) || "";
  const email = asTrimmedString((invoice.customerSnapshot as any)?.email || (invoice.customer as any)?.email) || "";

  const billingDetails = (invoice.customerSnapshot as any)?.billingDetails || {};
  const billingAddressLine =
    asTrimmedString(billingDetails?.billingAddress) ||
    asAddressLine((invoice.customerSnapshot as any)?.billingAddress) ||
    asTrimmedString((invoice.customerSnapshot as any)?.address) ||
    asTrimmedString((invoice.customer as any)?.address);
  const shippingAddressLine =
    asAddressLine((invoice.customerSnapshot as any)?.shippingAddress) || billingAddressLine;
  const billingAddress = (invoice.customerSnapshot as any)?.billingAddress || {};
  const shippingAddress = (invoice.customerSnapshot as any)?.shippingAddress || {};
  const destinationStateCode =
    getGstStateCodeFromAddress(shippingAddress) ||
    getGstStateCodeFromAddress(billingAddress) ||
    DEFAULT_DESTINATION_STATE_CODE;

  const gstNo =
    asTrimmedString(billingDetails?.gstin) ||
    asTrimmedString((invoice.customerSnapshot as any)?.gstin) ||
    "";
  const placeOfContact =
    asTrimmedString(billingDetails?.placeOfContact) ||
    resolvePlaceOfContactFromGstin(gstNo) ||
    (destinationStateCode
      ? GST_STATE_CODE_TO_PLACE_OF_CONTACT[destinationStateCode]
      : "") ||
    "";
  const gstTreatment = (gstNo ? "business_gst" : "business_none") as
    | "business_gst"
    | "business_none"
    | "consumer"
    | "overseas";

  const { firstName, lastName } = splitContactName(customerName);
  const attention = [firstName, lastName].filter(Boolean).join(" ").trim() || customerName;

  return {
    invoiceId: invoice.id,
    contactName: customerName,
    companyName,
    email,
    phone,
    gstNo,
    placeOfContact,
    gstTreatment,
    notes: `Created from Mo Track invoice ${asTrimmedString(invoice.invoiceNo || invoice.id)}.`,
    billingAddress: {
      attention,
      address: billingAddressLine || undefined,
      city: asTrimmedString(billingAddress.city) || undefined,
      state:
        asTrimmedString(billingAddress.state) ||
        DEFAULT_DESTINATION_STATE,
      zip: asTrimmedString(billingAddress.pincode) || undefined,
      phone: phone || undefined,
      country: "India",
    },
    shippingAddress: {
      attention,
      address: shippingAddressLine || undefined,
      city: asTrimmedString(shippingAddress.city) || undefined,
      state:
        asTrimmedString(shippingAddress.state) ||
        DEFAULT_DESTINATION_STATE,
      zip: asTrimmedString(shippingAddress.pincode) || undefined,
      phone: phone || undefined,
      country: "India",
    },
  };
};

export function InvoiceLogTable({
  zohoBotEnabled = false,
  historyType = "goods",
}: {
  zohoBotEnabled?: boolean;
  historyType?: "goods" | "vas";
}) {
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [regeneratingInvoiceIds, setRegeneratingInvoiceIds] = React.useState<Record<string, boolean>>({});
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'createdAt', desc: true }]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [searchText, setSearchText] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [selectedStore, setSelectedStore] = React.useState("all");
  const [orderStoreByOrderId, setOrderStoreByOrderId] = React.useState<Record<string, string>>({});
  const [creatorNameByUserId, setCreatorNameByUserId] = React.useState<Record<string, string>>({});
  const [missingCustomerInvoice, setMissingCustomerInvoice] = React.useState<Invoice | null>(null);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = React.useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = React.useState(false);
  const [customerDraft, setCustomerDraft] = React.useState<ZohoCustomerDraft | null>(null);

  const [isViewOpen, setIsViewOpen] = React.useState(false);
  const [isFetchingPayload, setIsFetchingPayload] = React.useState(false);
  const [viewPayload, setViewPayload] = React.useState<PrintableInvoicePayload | null>(null);

  const { toast } = useToast();

  const resolveCreatedAtMillis = React.useCallback((value: unknown): number | null => {
    if (!value) return null;

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (value instanceof Date) {
      const parsed = value.getTime();
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (typeof value === "object" && value !== null && "toDate" in value) {
      const maybeTimestamp = value as { toDate?: () => Date };
      if (typeof maybeTimestamp.toDate === "function") {
        const parsed = maybeTimestamp.toDate().getTime();
        return Number.isFinite(parsed) ? parsed : null;
      }
    }

    return null;
  }, []);

  const resolveStoreName = React.useCallback((invoice: Invoice): string => {
    const orderId = asTrimmedString(invoice.orderId);
    const assignedSalesmanStore = orderStoreByOrderId[orderId];
    if (assignedSalesmanStore) return assignedSalesmanStore;

    const directStore = String(
      (invoice as any)?.storeName ||
      (invoice as any)?.store ||
      ""
    ).trim();
    if (directStore) return directStore;

    const snapshotStore = String(
      (invoice.customerSnapshot as any)?.billingDetails?.storeName ||
      (invoice.customerSnapshot as any)?.billingDetails?.store ||
      ""
    ).trim();
    if (snapshotStore) return snapshotStore;

    return "-";
  }, [orderStoreByOrderId]);

  const resolveZohoVoucherNo = React.useCallback(
    (invoice: Invoice) => String(invoice.zohoInvoiceNo || invoice.tallyVoucherNo || "").trim(),
    []
  );

  const hasZohoVoucher = React.useCallback(
    (invoice: Invoice) => !!resolveZohoVoucherNo(invoice),
    [resolveZohoVoucherNo]
  );
  const canRegenerateZohoVoucher = React.useCallback(
    (invoice: Invoice) => {
      if (
        !zohoBotEnabled ||
        !canSyncInvoiceToZoho(invoice) ||
        hasZohoVoucher(invoice)
      ) {
        return false;
      }
      const status = String(invoice.zohoSyncStatus || "").trim().toLowerCase();
      return !status || status === "failed" || status === "retry_required";
    },
    [hasZohoVoucher, zohoBotEnabled]
  );

  React.useEffect(() => {
    const invoicesQuery = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(invoicesQuery, (snapshot) => {
      const invoicesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Invoice));
      setInvoices(invoicesData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching invoices:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load invoice data." });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  React.useEffect(() => {
    let cancelled = false;

    const hydrateOrderStores = async () => {
      const orderIds = Array.from(
        new Set(
          invoices
            .map((invoice) => asTrimmedString(invoice.orderId))
            .filter(Boolean)
        )
      );

      if (!orderIds.length) {
        if (!cancelled) setOrderStoreByOrderId({});
        return;
      }

      const orderMetaByOrderId = new Map<
        string,
        { representativeId?: string; fallbackStore?: string }
      >();

      for (const idChunk of chunkValues(orderIds)) {
        const ordersSnapshot = await getDocs(
          query(collection(db, "orders"), where(documentId(), "in", idChunk))
        );

        ordersSnapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const representativeId =
            asTrimmedString(data?.representativeId) ||
            asTrimmedString(data?.assignedSalesman?.id) ||
            undefined;
          const fallbackStore =
            asTrimmedString(data?.storeName) ||
            asTrimmedString(data?.salesmanStore) ||
            asTrimmedString(data?.assignedStoreName) ||
            asTrimmedString(data?.createdByStore) ||
            asTrimmedString(data?.originStoreName) ||
            undefined;

          orderMetaByOrderId.set(docSnap.id, { representativeId, fallbackStore });
        });
      }

      const representativeIds = Array.from(
        new Set(
          Array.from(orderMetaByOrderId.values())
            .map((meta) => meta.representativeId)
            .filter((value): value is string => !!value)
        )
      );

      const userStoreByUserId = new Map<string, string>();
      for (const repChunk of chunkValues(representativeIds)) {
        const usersSnapshot = await getDocs(
          query(collection(db, "users"), where(documentId(), "in", repChunk))
        );

        usersSnapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const store =
            asTrimmedString(data?.store) ||
            asTrimmedString(data?.storeName) ||
            "";
          if (store) userStoreByUserId.set(docSnap.id, store);
        });
      }

      const nextMap: Record<string, string> = {};
      orderMetaByOrderId.forEach((meta, orderId) => {
        const resolved =
          (meta.representativeId
            ? userStoreByUserId.get(meta.representativeId)
            : undefined) ||
          meta.fallbackStore ||
          "";
        if (resolved) nextMap[orderId] = resolved;
      });

      if (!cancelled) setOrderStoreByOrderId(nextMap);
    };

    void hydrateOrderStores();

    return () => {
      cancelled = true;
    };
  }, [invoices]);

  React.useEffect(() => {
    let cancelled = false;

    const hydrateCreatorNames = async () => {
      const creatorIds = Array.from(
        new Set(
          invoices
            .flatMap((invoice) => {
              const rawCreatedBy = invoice.createdBy;
              const createdByObject =
                rawCreatedBy && typeof rawCreatedBy === "object"
                  ? (rawCreatedBy as { id?: unknown })
                  : undefined;
              const rawCreatedByText =
                typeof rawCreatedBy === "string"
                  ? asTrimmedString(rawCreatedBy)
                  : "";
              const rawLooksLikeName =
                rawCreatedByText.includes(" ") ||
                rawCreatedByText.toLowerCase() === "system";

              return [
                asTrimmedString(invoice.createdById),
                asTrimmedString((invoice as any).createdByUserId),
                asTrimmedString(createdByObject?.id),
                asTrimmedString(invoice.approvedBy?.id),
                !rawLooksLikeName ? rawCreatedByText : "",
              ];
            })
            .filter(Boolean)
        )
      );

      if (!creatorIds.length) {
        if (!cancelled) setCreatorNameByUserId({});
        return;
      }

      const nextNames: Record<string, string> = {};
      for (const idChunk of chunkValues(creatorIds)) {
        const usersSnapshot = await getDocs(
          query(collection(db, "users"), where(documentId(), "in", idChunk))
        );
        usersSnapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const name =
            asTrimmedString(data.name) ||
            asTrimmedString(data.fullName) ||
            asTrimmedString(data.displayName) ||
            asTrimmedString(data.email);
          if (name) nextNames[docSnap.id] = name;
        });
      }

      if (!cancelled) setCreatorNameByUserId(nextNames);
    };

    void hydrateCreatorNames();

    return () => {
      cancelled = true;
    };
  }, [invoices]);

  const resolveCreatorName = React.useCallback(
    (invoice: Invoice): string => {
      const rawCreatedBy = invoice.createdBy;
      const createdByObject =
        rawCreatedBy && typeof rawCreatedBy === "object"
          ? (rawCreatedBy as { id?: unknown; name?: unknown })
          : undefined;
      const creatorIds = [
        invoice.createdById,
        (invoice as any).createdByUserId,
        createdByObject?.id,
        invoice.approvedBy?.id,
      ]
        .map(asTrimmedString)
        .filter(Boolean);

      for (const creatorId of creatorIds) {
        const resolved = creatorNameByUserId[creatorId];
        if (resolved) return resolved;
      }

      const savedName =
        asTrimmedString(invoice.createdByName) ||
        asTrimmedString(createdByObject?.name) ||
        asTrimmedString(invoice.approvedBy?.name);
      if (savedName && savedName.toLowerCase() !== "system") return savedName;

      const rawCreatedByText =
        typeof rawCreatedBy === "string" ? asTrimmedString(rawCreatedBy) : "";
      if (
        rawCreatedByText &&
        rawCreatedByText.toLowerCase() !== "system"
      ) {
        return creatorNameByUserId[rawCreatedByText] || rawCreatedByText;
      }

      return "System";
    },
    [creatorNameByUserId]
  );

  const historyInvoices = React.useMemo(
    () =>
      invoices.filter((invoice) =>
        historyType === "vas" ? isVasInvoice(invoice) : !isVasInvoice(invoice)
      ),
    [historyType, invoices]
  );

  const storeOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          historyInvoices
            .map((invoice) => resolveStoreName(invoice))
            .filter((store) => store && store !== "-")
        )
      ).sort((a, b) => a.localeCompare(b)),
    [historyInvoices, resolveStoreName]
  );

  const filteredInvoices = React.useMemo(() => {
    const search = asTrimmedString(searchText).toLowerCase();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    const fromTime = fromDate && Number.isFinite(fromDate.getTime()) ? fromDate.getTime() : null;
    const toTime = toDate && Number.isFinite(toDate.getTime()) ? toDate.getTime() : null;

    return historyInvoices.filter((invoice) => {
      if (search) {
        const customerName = asTrimmedString(
          invoice.customerSnapshot?.name || invoice.customer?.name || ""
        ).toLowerCase();
        const orderNo = asTrimmedString(invoice.orderNo || invoice.orderId).toLowerCase();
        const matchesSearch = customerName.includes(search) || orderNo.includes(search);
        if (!matchesSearch) return false;
      }

      if (selectedStore !== "all" && resolveStoreName(invoice) !== selectedStore) {
        return false;
      }

      if (fromTime === null && toTime === null) return true;

      const createdAtTime = resolveCreatedAtMillis(invoice.createdAt);
      if (createdAtTime === null) return false;
      if (fromTime !== null && createdAtTime < fromTime) return false;
      if (toTime !== null && createdAtTime > toTime) return false;
      return true;
    });
  }, [
    dateFrom,
    dateTo,
    historyInvoices,
    resolveCreatedAtMillis,
    resolveStoreName,
    searchText,
    selectedStore,
  ]);
  
  const regenerateZohoVoucher = React.useCallback(
    async (
      invoice: Invoice,
      options?: { silentSuccess?: boolean; customerId?: string; customerName?: string }
    ) => {
      if (!canSyncInvoiceToZoho(invoice)) return false;
      if (hasZohoVoucher(invoice)) return true;

      setRegeneratingInvoiceIds((prev) => ({ ...prev, [invoice.id]: true }));
      try {
        const response = await fetch("/api/zoho/invoices/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceId: invoice.id,
            customerId: asTrimmedString(options?.customerId) || undefined,
            customerName: asTrimmedString(options?.customerName) || undefined,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(String(result?.error || "Failed to regenerate Zoho voucher."));
        }

        const voucherNo = String(result?.invoice?.number || "").trim();
        if (!options?.silentSuccess) {
          toast({
            title: "Zoho voucher regenerated",
            description: voucherNo
              ? `Voucher ${voucherNo} has been saved to invoice history.`
              : "Zoho voucher has been regenerated.",
          });
        }
        return true;
      } catch (error: any) {
        const reason = asTrimmedString(error?.message);
        if (/no zoho customer found/i.test(reason) && !options?.customerId) {
          setMissingCustomerInvoice(invoice);
          setCustomerDraft(buildZohoCustomerDraftFromInvoice(invoice));
          setIsCreateCustomerOpen(true);
          toast({
            variant: "destructive",
            title: "Zoho customer missing",
            description: "Create the customer in Zoho to continue regeneration.",
          });
          return false;
        }

        toast({
          variant: "destructive",
          title: "Regenerate failed",
          description: reason || "Could not regenerate Zoho voucher.",
        });
        return false;
      } finally {
        setRegeneratingInvoiceIds((prev) => {
          const next = { ...prev };
          delete next[invoice.id];
          return next;
        });
      }
    },
    [hasZohoVoucher, toast]
  );

  const updateCustomerDraft = React.useCallback(
    (patch: Partial<ZohoCustomerDraft>) => {
      setCustomerDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    []
  );

  const updateCustomerAddressDraft = React.useCallback(
    (key: "billingAddress" | "shippingAddress", patch: Partial<ZohoCustomerDraftAddress>) => {
      setCustomerDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [key]: {
            ...(prev[key] || {}),
            ...patch,
          },
        };
      });
    },
    []
  );

  const handleCreateZohoCustomer = React.useCallback(async () => {
    if (!customerDraft) return;

    setIsCreatingCustomer(true);
    try {
      const response = await fetch("/api/zoho/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerDraft),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(result?.error || "Failed to create Zoho customer."));
      }

      const created = result?.customer as { id?: string; name?: string } | undefined;
      const customerId = asTrimmedString(created?.id);
      const customerName = asTrimmedString(created?.name);
      if (!customerId) {
        throw new Error("Zoho customer was created but response is missing customer id.");
      }

      toast({
        title: "Zoho customer created",
        description: customerName
          ? `${customerName} has been created in Zoho.`
          : "Customer has been created in Zoho.",
      });

      const invoice = missingCustomerInvoice;
      setIsCreateCustomerOpen(false);
      setCustomerDraft(null);
      setMissingCustomerInvoice(null);

      if (invoice) {
        await regenerateZohoVoucher(invoice, {
          customerId,
          customerName: customerName || undefined,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Create customer failed",
        description: asTrimmedString(error?.message) || "Could not create Zoho customer.",
      });
    } finally {
      setIsCreatingCustomer(false);
    }
  }, [customerDraft, missingCustomerInvoice, regenerateZohoVoucher, toast]);

  const handleViewInvoice = (invoice: Invoice) => {
    setIsFetchingPayload(true);
    setIsViewOpen(true);
    try {
      const payload = buildPrintablePayloadFromInvoice(invoice);
      setViewPayload(payload);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message || 'Could not render invoice.' });
      setIsViewOpen(false);
    } finally {
      setIsFetchingPayload(false);
    }
  };

  const columns: ColumnDef<Invoice>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          disabled={table.getPreFilteredRowModel().rows.every((row) => !canRegenerateZohoVoucher(row.original))}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          disabled={!canRegenerateZohoVoucher(row.original)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "invoiceNo",
      header: "Invoice No",
      cell: ({ row }) => <div className="font-mono">{row.getValue("invoiceNo")}</div>,
    },
    {
      id: "type",
      header: "Type",
      cell: ({ row }) => {
        const invoice = row.original;
        const type = invoice.invoiceType || (invoice.isVas ? "VAS" : "NORMAL");
        const label = type === "VAS" ? "VAS" : type === "MIXED" ? "Mixed" : "Goods";
        const variant =
          type === "VAS" ? "secondary" : type === "MIXED" ? "outline" : "default";
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      id: "company",
      header: "Company",
      cell: ({ row }) => (row.original.invoiceType === 'VAS' || row.original.isVas ? 'MO SPACE' : 'MO DESIGNS'),
    },
    {
      id: "store",
      header: "Store",
      cell: ({ row }) => resolveStoreName(row.original),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
         const dateMillis = resolveCreatedAtMillis(row.original.createdAt);
         if (dateMillis === null) return "-";
         return format(new Date(dateMillis), "dd/MM/yyyy");
      }
    },
    {
        accessorKey: "customerSnapshot.name",
        header: "Customer",
        cell: ({row}) => row.original.customerSnapshot?.name || row.original.customer?.name || "-"
    },
    {
      accessorKey: "orderId",
      header: "Order ID",
      cell: ({ row }) => (
        <Button variant="link" asChild className="p-0 h-auto">
            <Link href={`/dashboard/orders/${row.original.orderId}`}>{row.original.orderId}</Link>
        </Button>
      ),
    },
    {
        accessorKey: "totals.grandTotal",
        header: "Amount",
        cell: ({ row }) => {
          const rawAmount =
            row.original.totals?.grandTotal ??
            row.original.overallSummary?.grandTotal ??
            0;
          const amount = Math.round(Number(rawAmount) || 0);
          const pricingReview = (row.original as any)?.pricingReviewRequired;
          return (
            <div className="flex flex-col items-start gap-1">
              <span>{`₹${amount.toFixed(2)}`}</span>
              {pricingReview ? (
                <Badge
                  variant="outline"
                  className="border-red-200 bg-red-50 text-red-700"
                  title={`Quotation-based total: ₹${Number(
                    pricingReview.expectedTotal || 0
                  ).toFixed(2)}. Correct the synced Zoho invoice before changing this history amount.`}
                >
                  Pricing Review
                </Badge>
              ) : null}
            </div>
          );
        },
    },
    {
      id: "zohoVoucherNo",
      header: "Zoho Voucher No",
      cell: ({ row }) => resolveZohoVoucherNo(row.original) || "-",
    },
    {
      id: "zohoSyncStatus",
      header: "Zoho Sync",
      cell: ({ row }) => {
        const invoice = row.original;
        const pricingReview = (invoice as any)?.pricingReviewRequired;
        const status = isVasInvoice(invoice)
          ? "not_applicable"
          : invoice.zohoSyncStatus || (hasZohoVoucher(invoice) ? "synced" : "pending");
        const label =
          pricingReview
            ? "Pricing Review"
            : status === "not_applicable"
            ? "No Allow"
            : status === "local_only"
            ? "Mo Track Only"
            : status === "synced"
            ? "Synced Successfully"
            : status === "processing"
            ? "Processing"
            : status === "retry_required"
            ? "Retry Required"
            : status === "failed"
            ? "Failed"
            : "Pending Sync";
        const className =
          pricingReview
            ? "border-red-200 bg-red-50 text-red-700"
            : status === "not_applicable"
            ? "border-slate-200 bg-slate-50 text-slate-600"
            : status === "local_only"
            ? "border-violet-200 bg-violet-50 text-violet-700"
            : status === "synced"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : status === "processing"
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : status === "retry_required"
            ? "border-orange-200 bg-orange-50 text-orange-700"
            : status === "failed"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-700";

        return (
          <Badge
            variant="outline"
            className={className}
            title={
              pricingReview
                ? `Synced total ₹${Number(
                    pricingReview.currentTotal || 0
                  ).toFixed(2)} differs from quotation-based total ₹${Number(
                    pricingReview.expectedTotal || 0
                  ).toFixed(2)}.`
                : invoice.zohoSyncError || undefined
            }
          >
            {label}
          </Badge>
        );
      },
    },
     {
      id: "createdBy",
      header: "Created By",
      cell: ({ row }) => resolveCreatorName(row.original),
    },
    {
        id: "actions",
        header: "View",
        cell: ({ row }) => {
            const invoice = row.original;
            const isRegenerating = regeneratingInvoiceIds[invoice.id] === true;
            const missingVoucher = canRegenerateZohoVoucher(invoice);
            return (
                <div className="flex items-center gap-1">
                  {missingVoucher ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void regenerateZohoVoucher(invoice)}
                      disabled={isRegenerating}
                      title="Regenerate Zoho Voucher"
                    >
                      {isRegenerating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="h-4 w-4" />
                      )}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(invoice)}>
                      <Eye className="h-4 w-4" />
                  </Button>
                </div>
            );
        },
    }
  ];

  const table = useReactTable({
    data: filteredInvoices,
    columns,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => canRegenerateZohoVoucher(row.original),
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
      rowSelection,
    },
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const canSync =
    selectedRows.length > 0 &&
    selectedRows.every((row) => canRegenerateZohoVoucher(row.original));

  const handleRegenerateSelectedZohoVouchers = React.useCallback(async () => {
    const targets = table
      .getFilteredSelectedRowModel()
      .rows
      .map((row) => row.original)
      .filter(canRegenerateZohoVoucher);

    if (!targets.length) return;

    setIsSyncing(true);
    let successCount = 0;

    for (const invoice of targets) {
      const ok = await regenerateZohoVoucher(invoice, { silentSuccess: true });
      if (ok) successCount += 1;
    }

    setRowSelection({});
    setIsSyncing(false);

    if (successCount === targets.length) {
      toast({
        title: "Zoho vouchers regenerated",
        description: `${successCount} invoice(s) updated successfully.`,
      });
      return;
    }

    toast({
      variant: "destructive",
      title: "Regeneration completed with errors",
      description: `${successCount}/${targets.length} invoice(s) regenerated.`,
    });
  }, [canRegenerateZohoVoucher, regenerateZohoVoucher, table, toast]);

  const handlePrint = () => {
    const printContent = document.getElementById('printable-invoice-view');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write('<html><head><title>Print Invoice</title></head><body>');
    printWindow.document.write(printContent.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  return (
    <>
    <Card>
        <CardHeader>
            <CardTitle>
              {historyType === "vas"
                ? "VAS Invoice History"
                : "Goods Invoice History"}
            </CardTitle>
            <CardDescription>
              {historyType === "vas"
                ? "A separate log containing only generated VAS invoices."
                : "A log containing only generated Goods invoices and their Zoho voucher numbers."}
            </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
              <Input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                className="h-9 w-full md:max-w-sm text-sm"
                placeholder="Search customer or order no..."
                aria-label="Search by customer name or order number"
              />
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="h-9 w-full md:w-44 text-sm"
                aria-label="Filter from date"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="h-9 w-full md:w-44 text-sm"
                aria-label="Filter to date"
              />
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="h-9 w-full md:w-52 text-sm" aria-label="Filter by store">
                  <SelectValue placeholder="All stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  {storeOptions.map((store) => (
                    <SelectItem key={store} value={store}>
                      {store}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(searchText || dateFrom || dateTo || selectedStore !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 md:h-8 w-fit"
                  onClick={() => {
                    setSearchText("");
                    setDateFrom("");
                    setDateTo("");
                    setSelectedStore("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                            ))}
                        </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                             <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    <Skeleton className="h-20 w-full" />
                                </TableCell>
                            </TableRow>
                        ) : table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                {historyType === "vas"
                                  ? "No VAS invoices found."
                                  : "No Goods invoices found."}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
             <div className="flex items-center justify-end space-x-2 py-4">
                <div className="flex-1 text-sm text-muted-foreground">
                  {table.getFilteredSelectedRowModel().rows.length} of{" "}
                  {table.getFilteredRowModel().rows.length} row(s) selected.
                </div>
                 <Button 
                    onClick={() => void handleRegenerateSelectedZohoVouchers()}
                    disabled={isSyncing || !canSync}
                 >
                    {isSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="mr-2 h-4 w-4" />
                    )}
                    Regenerate Zoho Voucher
                 </Button>
                <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</Button>
            </div>
        </CardContent>
      </Card>
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
            <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Invoice Preview</DialogTitle>
                    <DialogDescription>
                        Viewing invoice #{viewPayload?.meta.invoiceNo} for order {viewPayload?.meta.orderNo}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex-grow overflow-y-auto pr-4" id="printable-invoice-view">
                    {isFetchingPayload ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <PrintableInvoice payload={viewPayload} />
                    )}
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsViewOpen(false)}>Close</Button>
                    <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4"/>Print</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      <Dialog
        open={isCreateCustomerOpen}
        onOpenChange={(open) => {
          setIsCreateCustomerOpen(open);
          if (!open && !isCreatingCustomer) {
            setCustomerDraft(null);
            setMissingCustomerInvoice(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Missing Zoho Customer</DialogTitle>
            <DialogDescription>
              Customer not found in Zoho. Review details and create customer to continue invoice regeneration.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Name *</p>
              <Input
                value={customerDraft?.contactName || ""}
                onChange={(event) => updateCustomerDraft({ contactName: event.target.value })}
                placeholder="Customer name"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company Name</p>
              <Input
                value={customerDraft?.companyName || ""}
                onChange={(event) => updateCustomerDraft({ companyName: event.target.value })}
                placeholder="Company name"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</p>
              <Input
                value={customerDraft?.phone || ""}
                onChange={(event) => updateCustomerDraft({ phone: event.target.value })}
                placeholder="Phone"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</p>
              <Input
                value={customerDraft?.email || ""}
                onChange={(event) => updateCustomerDraft({ email: event.target.value })}
                placeholder="Email"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">GST No</p>
              <Input
                value={customerDraft?.gstNo || ""}
                onChange={(event) => updateCustomerDraft({ gstNo: event.target.value.toUpperCase() })}
                placeholder="15-digit GSTIN"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Place Of Contact</p>
              <Input
                value={customerDraft?.placeOfContact || ""}
                onChange={(event) => updateCustomerDraft({ placeOfContact: event.target.value.toUpperCase() })}
                placeholder="State code (e.g. HR, TN)"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">GST Treatment</p>
              <Input
                value={customerDraft?.gstTreatment || ""}
                onChange={(event) =>
                  updateCustomerDraft({
                    gstTreatment:
                      (asTrimmedString(event.target.value) as
                        | "business_gst"
                        | "business_none"
                        | "consumer"
                        | "overseas") || "business_none",
                  })
                }
                placeholder="business_gst / business_none / consumer / overseas"
                list="zoho-gst-treatment-options"
              />
              <datalist id="zoho-gst-treatment-options">
                <option value="business_gst" />
                <option value="business_none" />
                <option value="consumer" />
                <option value="overseas" />
              </datalist>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billing Address</p>
              <Textarea
                value={customerDraft?.billingAddress?.address || ""}
                onChange={(event) =>
                  updateCustomerAddressDraft("billingAddress", { address: event.target.value })
                }
                placeholder="Billing address"
                className="min-h-[72px]"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Shipping Address</p>
              <Textarea
                value={customerDraft?.shippingAddress?.address || ""}
                onChange={(event) =>
                  updateCustomerAddressDraft("shippingAddress", { address: event.target.value })
                }
                placeholder="Shipping address"
                className="min-h-[72px]"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
              <Textarea
                value={customerDraft?.notes || ""}
                onChange={(event) => updateCustomerDraft({ notes: event.target.value })}
                placeholder="Notes"
                className="min-h-[64px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                if (isCreatingCustomer) return;
                setIsCreateCustomerOpen(false);
                setCustomerDraft(null);
                setMissingCustomerInvoice(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateZohoCustomer()}
              disabled={isCreatingCustomer || !asTrimmedString(customerDraft?.contactName)}
            >
              {isCreatingCustomer ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Customer & Regenerate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
