"use client";
import React, { useState, useCallback, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import {
  Customer, Deal, User, Cpd, Quotation, DealProduct, VasDetail,
} from "@/lib/types";
import {
  getQuotationsForDeal,
  updateQuotationStatusAction,
  deleteQuotationCascadeAction,
  getDealById,
  getCpdsForDeal,
} from "../../actions";
import { getCustomerById, getSalesmen } from "../../../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableRow, TableBody, TableCell, TableHead,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { CreateQuotationDialog } from "@/components/features/order-management/CreateQuotationDialog";
import { FileText, MoreHorizontal, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { parseDate } from "../../utils/dateUtils";

const getQuotationValueBreakdown = (quotation: Quotation) => {
  const items = Array.isArray(quotation.items) ? quotation.items : [];
  const goodsTotal = items.reduce((sum, item: any) => {
    const quantity = Number(item.quantity ?? item.qty) || 0;
    const rawRate = Number(item.rate ?? item.mrp ?? item.price) || 0;
    const gstPercent = Number(item.gstPercent ?? item.gst ?? 0) || 0;
    const gstMode = item.gstMode === "EXCL" ? "EXCL" : "INCL";
    const storedExclusiveRate = Number(item.exclusiveRate);
    const exclusiveRate =
      Number.isFinite(storedExclusiveRate) && storedExclusiveRate > 0
        ? storedExclusiveRate
        : gstMode === "INCL" && gstPercent > 0
          ? rawRate / (1 + gstPercent / 100)
          : rawRate;
    const taxableBeforeDiscount = quantity * exclusiveRate;
    const discountPercent = Number(item.discountPercent ?? item.discount) || 0;
    const taxableAmount = Math.max(
      0,
      taxableBeforeDiscount - taxableBeforeDiscount * (discountPercent / 100)
    );
    return sum + taxableAmount + taxableAmount * (gstPercent / 100);
  }, 0);

  const vasDetails = Array.isArray(quotation.vasDetails) ? quotation.vasDetails : [];
  const vasTotal = vasDetails.reduce((sum, vas: any) => {
    const quantity = Number(vas.quantity ?? vas.qty) || 0;
    const rate = Number(vas.exclusiveRate ?? vas.rate) || 0;
    const gstPercent = Number(vas.gstPercent ?? vas.gst) || 0;
    const taxableAmount = quantity * rate;
    return sum + taxableAmount + taxableAmount * (gstPercent / 100);
  }, 0);

  return {
    goods: goodsTotal,
    vas: vasTotal,
    total: goodsTotal + vasTotal,
  };
};

const getQuotationDisplayAmount = (quotation: Quotation): number =>
  getQuotationValueBreakdown(quotation).total;

const mapQuotationItemsForDialog = (quotation: Quotation): DealProduct[] =>
  (quotation.items || []).map((item: any, index) => ({
    id: item.id || `quotation-item-${index}`,
    productType:
      String(item.bcnType || "").toLowerCase() === "hardware"
        ? "Hardware"
        : "Fabric",
    collectionBrand: item.collectionBrand || item.bcn || "",
    bcn: item.collectionBrand || item.bcn || "",
    serialNo: item.serialNo || "",
    itemName: item.salesDescription || "",
    salesDescription: item.salesDescription || "",
    quantity: String(item.quantity ?? item.qty ?? "0"),
    rate: Number(item.rate ?? 0),
    mrp: String(item.originalMrp ?? item.rate ?? 0),
    discountPercent: Number(item.discountPercent ?? 0),
    gstMode: item.gstMode || "INCL",
    exclusiveRate: Number(item.exclusiveRate),
    room: item.room || "",
    noOfPcs: item.noOfPcs || "1",
    remarks: item.remark || "",
    unit: item.unit || item.stockUnit || "Mtr",
    gstPercent: Number(item.gstPercent ?? 0),
    hsnCode: item.hsnCode || "",
    categoryGroup: item.categoryGroup || "",
  })) as DealProduct[];

const mapQuotationVasForDialog = (quotation: Quotation): VasDetail[] =>
  (quotation.vasDetails || []).map((vas: any) => ({
    vasName: vas.vasName || vas.description || "",
    rate: String(vas.rate ?? vas.exclusiveRate ?? "0"),
    quantity: String(vas.quantity ?? vas.qty ?? "1"),
    room: vas.room || vas.roomName || "",
    gstPercent: Number(vas.gstPercent ?? vas.gst ?? 0),
    hsnCode: vas.hsnCode || vas.hsn || "",
  }));


interface QuotationsTabProps {
  customerId: string;
  dealId: string;
  customer?: Customer | null;
  deal?: Deal | null;
  salesmen?: User[];
  cpds?: Cpd[];
  focusOrderNo?: string | null;
}

// ✅ Memoized row component — prevents re-rendering all rows when one changes
const QuotationRow = memo(function QuotationRow({
  q,
  index,
  isAdmin,
  canEditConverted,
  deletingId,
  onView,
  onEdit,
  onClone,
  onConvert,
  onClose,
  onDelete,
}: {
  q: Quotation;
  index: number;
  isAdmin: boolean;
  canEditConverted: boolean;
  deletingId: string | null;
  onView: () => void;
  onEdit: () => void;
  onClone: () => void;
  onConvert: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const isDisabled = q.status === "Converted to Order" || q.status === "Closed";
  const displayAmount = getQuotationDisplayAmount(q);
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50" onClick={onView}>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }}>
              View / Print
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              disabled={q.status !== "Converted to Order" || !canEditConverted}
            >
              Edit Converted Quotation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClone(); }}>
              Clone Quotation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onConvert(); }} disabled={isDisabled}>
              Convert to Order
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClose(); }} disabled={isDisabled}>
              Close Quotation
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                disabled={deletingId === q.id}
                className="text-destructive focus:text-destructive"
              >
                {deletingId === q.id ? "Deleting..." : "Delete Quotation"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
      <TableCell>{index + 1}</TableCell>
      <TableCell className="font-medium">{q.quotationNo}</TableCell>
      <TableCell>{format(parseDate(q.date), "dd/MM/yyyy")}</TableCell>
      <TableCell>{q.customerName}</TableCell>
      <TableCell>
        {q.status === "Closed" ? (
          <Badge variant="secondary">Closed</Badge>
        ) : (
          <Badge variant="outline">{q.status}</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">₹{displayAmount.toFixed(2)}</TableCell>
      <TableCell>{q.store}</TableCell>
    </TableRow>
  );
});

export default function QuotationsTab({
  customerId,
  dealId,
  customer: customerProp,
  deal: dealProp,
  salesmen: salesmenProp = [],
  cpds: cpdsProp = [],
  focusOrderNo,
}: QuotationsTabProps) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(customerProp ?? null);
  const [deal, setDeal] = useState<Deal | null>(dealProp ?? null);
  const [salesmen, setSalesmen] = useState<User[]>(salesmenProp);
  const [cpds, setCpds] = useState<Cpd[]>(cpdsProp);
  const [loading, setLoading] = useState(true);
  const [deletingQuotationId, setDeletingQuotationId] = useState<string | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [editSourceQuotation, setEditSourceQuotation] = useState<Quotation | null>(null);
  const [editItems, setEditItems] = useState<DealProduct[]>([]);
  const [editVasDetails, setEditVasDetails] = useState<VasDetail[]>([]);
  const [cloneSourceQuotation, setCloneSourceQuotation] = useState<Quotation | null>(null);
  const [cloneItems, setCloneItems] = useState<DealProduct[]>([]);
  const [cloneVasDetails, setCloneVasDetails] = useState<VasDetail[]>([]);
  const router = useRouter();
  const { toast } = useToast();
  const { role, user } = useAuth();
  const isAdmin = role === "admin";
  const normalizedRole = String(role || user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const normalizedDesignation = String(user?.designation || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const canEditConvertedQuotation =
    normalizedRole === "admin" ||
    normalizedRole === "md" ||
    normalizedRole === "managingdirector" ||
    normalizedDesignation === "ea" ||
    normalizedDesignation === "md" ||
    normalizedDesignation === "managingdirector";


  useEffect(() => {
    if (customerProp) setCustomer(customerProp);
    if (dealProp) setDeal(dealProp);
    if (salesmenProp.length > 0) setSalesmen(salesmenProp);
    if (cpdsProp.length > 0) setCpds(cpdsProp);
  }, [customerProp, dealProp, salesmenProp, cpdsProp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (customer && deal && salesmen.length > 0) return;
      try {
        const [customerData, dealData, salesmenData, cpdsData] = await Promise.all([
          customer ? Promise.resolve(customer) : getCustomerById(customerId),
          deal ? Promise.resolve(deal) : getDealById(customerId, dealId),
          salesmen.length > 0 ? Promise.resolve(salesmen) : getSalesmen(),
          cpds.length > 0 ? Promise.resolve(cpds) : getCpdsForDeal(customerId, dealId),
        ]);
        if (cancelled) return;
        setCustomer(customerData ?? null);
        setDeal(dealData ?? null);
        setSalesmen(salesmenData ?? []);
        setCpds(cpdsData ?? []);
      } catch (error) {
        console.error("Failed to load quotation context:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer, customerId, cpds, deal, dealId, salesmen]);

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    const data = await getQuotationsForDeal(customerId, dealId);
    setQuotations(data);
    setLoading(false);
  }, [customerId, dealId]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  useEffect(() => {
    if (!focusOrderNo || quotations.length === 0) return;
    const normalizeOrderNo = (value: unknown) =>
      String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/^MOTRACK[-_]?/, "");
    const target = normalizeOrderNo(focusOrderNo);
    const matchingQuotation = quotations.find(
      (quotation) => normalizeOrderNo(quotation.orderNo) === target
    );
    if (matchingQuotation) setSelectedQuotation(matchingQuotation);
  }, [focusOrderNo, quotations]);

  const handleConvertToOrder = useCallback(
    (q: Quotation) => {
      router.push(`/dashboard/invoice/new?customerId=${customerId}&dealId=${dealId}&quotationId=${q.id}`);
    },
    [router, customerId, dealId]
  );

  const handleCloseQuotation = useCallback(
    async (q: Quotation) => {
      if (q.status === "Converted to Order") {
        toast({ variant: "destructive", title: "Cannot Close", description: "Converted quotations cannot be closed." });
        return;
      }
      const result = await updateQuotationStatusAction(customerId, dealId, q.id, "Closed");
      if (result.success) {
        toast({ title: "Quotation Closed", description: result.message });
        fetchQuotations();
      } else {
        toast({ variant: "destructive", title: "Close Failed", description: result.message });
      }
    },
    [customerId, dealId, toast, fetchQuotations]
  );

  const handleDeleteQuotation = useCallback(
    async (q: Quotation) => {
      if (!isAdmin) return;
      if (!window.confirm(`Delete quotation ${q.quotationNo}? This will also delete linked order and invoices.`)) return;
      try {
        setDeletingQuotationId(q.id);
        const result = await deleteQuotationCascadeAction(customerId, dealId, q.id, {
          id: user?.id, name: user?.name || user?.email || "System", role: role || undefined,
        });
        if (!result.success) {
          toast({ variant: "destructive", title: "Delete Failed", description: result.message });
          return;
        }
        toast({ title: "Quotation Deleted", description: result.message });
        await fetchQuotations();
        if (selectedQuotation?.id === q.id) setSelectedQuotation(null);
      } catch (error: any) {
        toast({ variant: "destructive", title: "Delete Failed", description: error?.message });
      } finally {
        setDeletingQuotationId(null);
      }
    },
    [isAdmin, customerId, dealId, user, role, toast, fetchQuotations, selectedQuotation]
  );

  const handleCloneQuotation = useCallback(
    (quotation: Quotation) => {
      if (!deal || !customer) {
        toast({
          variant: "destructive",
          title: "Cannot Clone",
          description: "Deal/customer data is still loading. Please try again.",
        });
        return;
      }

      setCloneSourceQuotation(quotation);
      setCloneItems(mapQuotationItemsForDialog(quotation));
      setCloneVasDetails(mapQuotationVasForDialog(quotation));
    },
    [deal, customer, toast]
  );

  const handleEditQuotation = useCallback(
    (quotation: Quotation) => {
      if (!canEditConvertedQuotation) {
        toast({
          variant: "destructive",
          title: "Access restricted",
          description: "Only EA, Admin, or MD can edit a quotation after order placement.",
        });
        return;
      }
      if (!deal || !customer) {
        toast({
          variant: "destructive",
          title: "Cannot Edit",
          description: "Deal/customer data is still loading. Please try again.",
        });
        return;
      }
      if (quotation.status !== "Converted to Order") {
        toast({
          variant: "destructive",
          title: "Cannot Edit",
          description: "This correction flow is only for converted quotations.",
        });
        return;
      }

      setEditSourceQuotation(quotation);
      setEditItems(mapQuotationItemsForDialog(quotation));
      setEditVasDetails(mapQuotationVasForDialog(quotation));
    },
    [canEditConvertedQuotation, deal, customer, toast]
  );

  const handleEditDialogClose = useCallback(() => {
    setEditSourceQuotation(null);
    setEditItems([]);
    setEditVasDetails([]);
  }, []);

  const handleCloneDialogClose = useCallback(() => {
    setCloneSourceQuotation(null);
    setCloneItems([]);
    setCloneVasDetails([]);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const convertedQuotations = quotations.filter(
    (quotation) => quotation.status === "Converted to Order"
  );
  const convertedValueBreakdown = convertedQuotations.reduce(
    (totals, quotation) => {
      const value = getQuotationValueBreakdown(quotation);
      return {
        goods: totals.goods + value.goods,
        vas: totals.vas + value.vas,
        total: totals.total + value.total,
      };
    },
    { goods: 0, vas: 0, total: 0 }
  );
  const totalConvertedOrderValue = convertedValueBreakdown.total;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quotation Details</CardTitle>
        </CardHeader>
        <CardContent>
          {quotations.length > 0 ? (
            <div className="space-y-3">
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Quotation No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Store</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotations.map((q, i) => (
                      <QuotationRow
                        key={q.id}
                        q={q}
                        index={i}
                        isAdmin={isAdmin}
                        canEditConverted={canEditConvertedQuotation}
                        deletingId={deletingQuotationId}
                        onView={() => setSelectedQuotation(q)}
                        onEdit={() => handleEditQuotation(q)}
                        onClone={() => handleCloneQuotation(q)}
                        onConvert={() => handleConvertToOrder(q)}
                        onClose={() => handleCloseQuotation(q)}
                        onDelete={() => handleDeleteQuotation(q)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              {convertedQuotations.length > 0 && (
                <div className="flex justify-end border-t pt-4">
                  <div className="min-w-80 rounded-lg bg-muted/50 px-5 py-4">
                    <div className="flex items-center justify-between gap-6 text-sm">
                      <span className="text-muted-foreground">
                        Converted Goods Value
                      </span>
                      <span className="font-semibold">
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(convertedValueBreakdown.goods)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-6 text-sm">
                      <span className="text-muted-foreground">
                        Converted VAS Value
                      </span>
                      <span className="font-semibold">
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(convertedValueBreakdown.vas)}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-6 border-t pt-3">
                      <span className="font-medium">
                        Total Converted to Order Value
                      </span>
                      <span className="text-2xl font-bold">
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(totalConvertedOrderValue)}
                      </span>
                    </div>
                    <p className="mt-2 text-right text-xs text-muted-foreground">
                      {convertedQuotations.length} converted quotation
                      {convertedQuotations.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              )}
              {/* Mobile cards — same pattern, omitted for brevity */}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>No quotations have been generated for this deal yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
      {selectedQuotation && customer && deal && (
        <QuotationDetailDialog
          isOpen={!!selectedQuotation}
          onClose={() => setSelectedQuotation(null)}
          quotation={selectedQuotation}
          deal={deal}
          customer={customer}
          salesmen={salesmen}
          cpds={cpds}
          onEdit={
            canEditConvertedQuotation &&
            selectedQuotation.status === "Converted to Order"
              ? () => {
                  const quotation = selectedQuotation;
                  setSelectedQuotation(null);
                  handleEditQuotation(quotation);
                }
              : undefined
          }
        />
      )}
      {editSourceQuotation && customer && deal && (
        <CreateQuotationDialog
          isOpen={!!editSourceQuotation}
          onOpenChange={(open) => {
            if (!open) handleEditDialogClose();
          }}
          onSuccess={async () => {
            await fetchQuotations();
            handleEditDialogClose();
          }}
          deal={deal}
          customer={customer}
          initialItems={editItems}
          initialVasDetails={editVasDetails}
          initialQuotation={editSourceQuotation}
          mode="edit"
        />
      )}
      {cloneSourceQuotation && customer && deal && (
        <CreateQuotationDialog
          isOpen={!!cloneSourceQuotation}
          onOpenChange={(open) => {
            if (!open) handleCloneDialogClose();
          }}
          onSuccess={async () => {
            await fetchQuotations();
            handleCloneDialogClose();
          }}
          deal={deal}
          customer={customer}
          initialItems={cloneItems}
          initialVasDetails={cloneVasDetails}
          initialQuotation={cloneSourceQuotation}
          mode="clone"
        />
      )}
    </>
  );
}
