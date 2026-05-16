"use client";
import React, { useState, useCallback, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import {
  Customer, Deal, User, Cpd, Quotation,
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
import { FileText, MoreHorizontal, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { parseDate } from "../../utils/dateUtils";

interface QuotationsTabProps {
  customerId: string;
  dealId: string;
  customer?: Customer | null;
  deal?: Deal | null;
  salesmen?: User[];
  cpds?: Cpd[];
  onCloneQuotation?: (quotation: Quotation) => void;
}

// ✅ Memoized row component — prevents re-rendering all rows when one changes
const QuotationRow = memo(function QuotationRow({
  q,
  index,
  isAdmin,
  deletingId,
  onView,
  onClone,
  onConvert,
  onClose,
  onDelete,
}: {
  q: Quotation;
  index: number;
  isAdmin: boolean;
  deletingId: string | null;
  onView: () => void;
  onClone: () => void;
  onConvert: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const isDisabled = q.status === "Converted to Order" || q.status === "Closed";
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
      <TableCell className="text-right">₹{q.totalAmount.toFixed(2)}</TableCell>
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
  onCloneQuotation,
}: QuotationsTabProps) {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(customerProp ?? null);
  const [deal, setDeal] = useState<Deal | null>(dealProp ?? null);
  const [salesmen, setSalesmen] = useState<User[]>(salesmenProp);
  const [cpds, setCpds] = useState<Cpd[]>(cpdsProp);
  const [loading, setLoading] = useState(true);
  const [deletingQuotationId, setDeletingQuotationId] = useState<string | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { role, user } = useAuth();
  const isAdmin = role === "admin";

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

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

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
                        deletingId={deletingQuotationId}
                        onView={() => setSelectedQuotation(q)}
                        onClone={() => onCloneQuotation?.(q)}
                        onConvert={() => handleConvertToOrder(q)}
                        onClose={() => handleCloseQuotation(q)}
                        onDelete={() => handleDeleteQuotation(q)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
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
        />
      )}
    </>
  );
}
