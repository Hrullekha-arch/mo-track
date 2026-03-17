"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  RowSelectionState,
} from "@tanstack/react-table";
import {
  ArrowLeft,
  Search,
  Loader2,
  Calendar as CalendarIcon,
  Trash2,
  ShoppingCart,
  Package,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  getPendingPoItems,
  createPurchaseOrderAction,
  PendingPoItem,
  PoCreationData,
  getQuotationDialogData,
  deletePurchaseOrderAction,
} from "./actions";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { QuotationDetailDialog } from "@/components/features/order-management/QuotationDetailDialog";
import { getSalesmen } from "@/app/dashboard/customers/actions";
import { Quotation, Deal, User, Cpd } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

// ─── Schema ────────────────────────────────────────────────────────────────────
const createPoSchema = z.object({
  vendor: z.string().min(1, "Vendor name is required."),
  courier: z.string().min(1, "Courier is required."),
  mode: z.enum(["AIR", "SURFACE"], { required_error: "Mode is required." }),
  tallyPoNumber: z.string().optional(),
  items: z.array(
    z.object({
      id: z.string(),
      purchaseQty: z.number().min(0.01, "Quantity must be > 0."),
    })
  ),
  promiseDeliveryDate: z.date({ required_error: "Promise delivery date is required." }),
});

type CreatePoFormValues = z.infer<typeof createPoSchema>;

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("rounded-lg p-3 shrink-0", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold leading-none mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Vendor Verification Dialog ────────────────────────────────────────────────
function VendorVerificationDialog({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (isNew: boolean) => void;
}) {
  const [selection, setSelection] = React.useState<string>("");

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-full bg-blue-100 p-2">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <DialogTitle>Vendor Verification</DialogTitle>
          </div>
          <DialogDescription>
            Is the selected vendor a new or existing vendor in your system?
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "yes", label: "Existing Vendor", desc: "Already registered", icon: CheckCircle2, color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
              { value: "no", label: "New Vendor", desc: "Not yet registered", icon: AlertCircle, color: "border-amber-300 bg-amber-50 text-amber-700" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelection(opt.value)}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-all",
                  selection === opt.value
                    ? opt.color + " border-current"
                    : "border-border hover:bg-muted/40"
                )}
              >
                <opt.icon className={cn("h-5 w-5 mb-2", selection === opt.value ? "" : "text-muted-foreground")} />
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(selection === "no")} disabled={!selection}>
            Continue →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create PO Dialog ──────────────────────────────────────────────────────────
function CreatePoDialog({
  isOpen,
  onClose,
  items,
  creator,
  onSuccess,
  isNewVendor,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: PendingPoItem[];
  creator: { id: string; name: string } | null;
  onSuccess: () => void;
  isNewVendor: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { toast } = useToast();

  const form = useForm<CreatePoFormValues>({
    resolver: zodResolver(createPoSchema),
    defaultValues: { vendor: "", courier: "", mode: "SURFACE", tallyPoNumber: "", items: [] },
  });

  const { control, handleSubmit } = form;

  React.useEffect(() => {
    if (items.length > 0) {
      form.reset({
        vendor: items[0].vendorName || "",
        courier: "",
        mode: "SURFACE",
        tallyPoNumber: items[0]?.originalRequest?.tallyPoNumber || "",
        items: items.map((item) => ({ id: item.id, purchaseQty: item.neededQty })),
        promiseDeliveryDate: undefined,
      });
    }
  }, [items, form]);

  const onSubmit = async (values: CreatePoFormValues) => {
    if (!creator || items.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Missing required data." });
      return;
    }
    setIsSubmitting(true);
    try {
      const poData: PoCreationData = {
        vendor: values.vendor,
        courier: values.courier,
        mode: values.mode,
        items: items.map((originalItem) => {
          const formItem = values.items.find((i) => i.id === originalItem.id);
          return { ...originalItem, neededQty: formItem?.purchaseQty || originalItem.neededQty };
        }),
        isNewVendor,
        promiseDeliveryDate: values.promiseDeliveryDate?.toISOString(),
        tallyPoNumber: values.tallyPoNumber?.trim() || undefined,
      };
      const result = await createPurchaseOrderAction(poData, creator);
      if (result.success) {
        toast({ title: "PO Created!", description: result.message });
        onSuccess();
        onClose();
      } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
      }
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "An unexpected error occurred." });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!items || items.length === 0) return null;

  const totalQty = items.reduce((sum, i) => sum + i.neededQty, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold">Create Purchase Order</DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {items.length} item{items.length > 1 ? "s" : ""} · Vendor:{" "}
                <strong>{items[0].vendorName || "Unknown"}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isNewVendor ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
                  <AlertCircle className="mr-1 h-3 w-3" /> New Vendor
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Existing Vendor
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">
                Total: {totalQty.toFixed(2)}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} id="create-po-form" className="space-y-5">
              {/* Fields */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <FormField name="vendor" control={control} render={({ field }) => (
                  <FormItem className="col-span-2 md:col-span-1">
                    <FormLabel>Vendor *</FormLabel>
                    <FormControl><Input {...field} className="h-9" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="courier" control={control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Courier *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="S M COURIER">S M COURIER</SelectItem>
                        <SelectItem value="NITCO LOGISTICS PVT LTD">NITCO LOGISTICS</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="mode" control={control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mode *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="AIR">✈ AIR</SelectItem>
                        <SelectItem value="SURFACE">🚛 SURFACE</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField name="tallyPoNumber" control={control} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tally PO No.</FormLabel>
                    <FormControl><Input {...field} placeholder="Optional" className="h-9" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField
                  control={control}
                  name="promiseDeliveryDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col gap-1">
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Delivery Date *
                      </FormLabel>

                      <input
                        type="date"
                        min={new Date().toISOString().split("T")[0]}
                        value={
                          field.value
                            ? new Date(field.value).toISOString().split("T")[0]
                            : ""
                        }
                        onChange={(e) =>
                          field.onChange(e.target.value ? new Date(e.target.value) : null)
                        }
                        className="w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-900
                          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                          disabled:opacity-50 disabled:cursor-not-allowed
                          [&::-webkit-calendar-picker-indicator]:opacity-50
                          [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                      />

                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              {/* Items Table */}
              <div>
                <p className="text-sm font-semibold mb-3">Items to Purchase</p>
                <div className="rounded-xl border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {["#", "BCN / Item", "Order Qty", "In Stock", "Purchase Qty"].map((h) => (
                          <TableHead key={h} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-9">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, index) => (
                        <TableRow key={item.id} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          <TableCell className="text-xs text-muted-foreground w-8">{index + 1}</TableCell>
                          <TableCell>
                            <p className="text-sm font-semibold font-mono">{item.collectionBrand}</p>
                            <p className="text-xs text-muted-foreground">{item.itemName}</p>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm font-medium">{item.neededQty.toFixed(2)}</span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("text-xs", item.stock > 0
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 text-slate-500"
                              )}
                            >
                              {item.stock.toFixed(2)}
                            </Badge>
                          </TableCell>
                          <TableCell className="w-32">
                            <FormField
                              name={`items.${index}.purchaseQty`}
                              control={control}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  type="number"
                                  step="0.01"
                                  className="h-8 text-sm"
                                  onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                />
                              )}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </form>
          </Form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between shrink-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-po-form" disabled={isSubmitting} className="min-w-[140px]">
            {isSubmitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating PO...</>
            ) : (
              <><ShoppingCart className="mr-2 h-4 w-4" /> Create PO</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete PO Dialog ──────────────────────────────────────────────────────────
function DeletePoDialog({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (poNumber: string) => void;
  isDeleting: boolean;
}) {
  const [poNumber, setPoNumber] = React.useState("");

  React.useEffect(() => {
    if (!isOpen) setPoNumber("");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o && !isDeleting) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="rounded-full bg-red-100 p-2">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <DialogTitle>Delete Purchase Order</DialogTitle>
          </div>
          <DialogDescription>
            Admin only. This will remove the PO from linked purchase requests and delete its inbound document. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 space-y-2">
          <Label htmlFor="delete-po-number" className="text-sm font-medium">PO Number</Label>
          <Input
            id="delete-po-number"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            placeholder="Enter PO number to delete"
            disabled={isDeleting}
            className="h-9"
          />
          {poNumber && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              Deleting PO <strong className="font-mono">{poNumber}</strong>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isDeleting}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm(poNumber)}
            disabled={isDeleting || !poNumber.trim()}
          >
            {isDeleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</> : "Confirm Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function PendingPOPage() {
  const [data, setData] = React.useState<PendingPoItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isVerificationOpen, setIsVerificationOpen] = React.useState(false);
  const [isCreatePoOpen, setIsCreatePoOpen] = React.useState(false);
  const [isDeletePoOpen, setIsDeletePoOpen] = React.useState(false);
  const [isNewVendor, setIsNewVendor] = React.useState(false);
  const [isDeletingPo, setIsDeletingPo] = React.useState(false);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedQuotation, setSelectedQuotation] = React.useState<Quotation | null>(null);
  const [selectedDeal, setSelectedDeal] = React.useState<Deal | null>(null);
  const [salesmen, setSalesmen] = React.useState<User[]>([]);
  const [cpds, setCpds] = React.useState<Cpd[]>([]);
  const [isDialogLoading, setIsDialogLoading] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const items = await getPendingPoItems();
      setData(items);
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: "Could not load pending PO data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    fetchData();
    getSalesmen().then(setSalesmen);
  }, [fetchData]);

  const handleVerificationConfirm = (isNew: boolean) => {
    setIsNewVendor(isNew);
    setIsVerificationOpen(false);
    setIsCreatePoOpen(true);
  };

  const handleDeletePo = async (poNumber: string) => {
    const trimmed = poNumber.trim();
    if (!trimmed) { toast({ variant: "destructive", title: "Enter a PO number" }); return; }
    if (!user?.id || !isAdmin) { toast({ variant: "destructive", title: "Unauthorized" }); return; }

    setIsDeletingPo(true);
    try {
      const result = await deletePurchaseOrderAction(trimmed, { id: user.id, name: user.name });
      if (result.success) {
        toast({ title: "PO Deleted", description: result.message });
        setIsDeletePoOpen(false);
        await fetchData();
        setRowSelection({});
      } else {
        toast({ variant: "destructive", title: "Delete Failed", description: result.message });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: error?.message || "Something went wrong." });
    } finally {
      setIsDeletingPo(false);
    }
  };

  const handleQuotationClick = async (dealId: string, quotationNo: string) => {
    if (!dealId || !quotationNo) return;
    setIsDialogLoading(true);
    setSelectedQuotation(null);
    try {
      const result = await getQuotationDialogData(dealId, quotationNo);
      if (result) {
        setSelectedQuotation(result.quotation);
        setSelectedDeal(result.deal);
        setCpds(result.cpds);
      } else {
        toast({ variant: "destructive", title: "Quotation not found" });
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not fetch quotation details." });
    } finally {
      setIsDialogLoading(false);
    }
  };

  const columns: ColumnDef<PendingPoItem>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: "quotationNo",
      header: "Quotation No",
      cell: ({ row }) => (
        <button
          className="font-semibold text-primary hover:underline underline-offset-2 text-sm"
          onClick={() => handleQuotationClick(row.original.dealId, row.original.quotationNo)}
        >
          {row.original.quotationNo}
        </button>
      ),
    },
    {
      accessorKey: "customerName",
      header: "Customer",
      cell: ({ row }) => <span className="text-sm">{row.getValue("customerName")}</span>,
    },
    {
      accessorKey: "salesman",
      header: "Salesman",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary text-xs font-bold">
            {String(row.original.salesman || "").charAt(0).toUpperCase()}
          </div>
          <span className="text-sm">{row.original.salesman || "—"}</span>
        </div>
      ),
    },
    {
      accessorKey: "collectionBrand",
      header: "BCN",
      cell: ({ row }) => (
        <span className="text-sm font-mono font-semibold">{row.getValue("collectionBrand")}</span>
      ),
    },
    {
      accessorKey: "itemName",
      header: "Item Name",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.getValue("itemName")}</span>
      ),
    },
    {
      accessorKey: "neededQty",
      header: "Order Qty",
      cell: ({ row }) => (
        <span className="text-sm font-semibold">
          {Number(row.getValue("neededQty")).toFixed(2)}
        </span>
      ),
    },
    {
      accessorKey: "vendorName",
      header: "Vendor",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs font-medium">
          {row.original.vendorName || "—"}
        </Badge>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    initialState: { pagination: { pageSize: 15 } },
    state: { globalFilter, rowSelection },
  });

  const selectedItems = table.getFilteredSelectedRowModel().rows.map((r) => r.original);

  const canCreatePo = React.useMemo(() => {
    if (selectedItems.length === 0) return false;
    const firstVendor = selectedItems[0].vendorName;
    if (!firstVendor) return false;
    return selectedItems.every((item) => item.vendorName === firstVendor);
  }, [selectedItems]);

  const vendorGroups = React.useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((item) => {
      const vendor = item.vendorName || "Unknown";
      map.set(vendor, (map.get(vendor) || 0) + 1);
    });
    return map.size;
  }, [data]);

  return (
    <>
      <TooltipProvider>
        <div className="w-full space-y-6 p-4 md:p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">SO → PO Generation</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Select items from the same vendor to generate a Purchase Order.
              </p>
            </div>
            <Button variant="outline" size="sm" asChild className="shrink-0">
              <Link href="/dashboard/purchase">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Purchases
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard
              label="Pending Items"
              value={data.length}
              icon={Package}
              color="bg-blue-500"
              sub="Awaiting PO creation"
            />
            <StatCard
              label="Vendor Groups"
              value={vendorGroups}
              icon={Building2}
              color="bg-violet-500"
              sub="Unique vendors"
            />
            <StatCard
              label="Selected"
              value={selectedItems.length}
              icon={ShoppingCart}
              color={canCreatePo ? "bg-emerald-500" : "bg-amber-500"}
              sub={canCreatePo ? "Ready to create PO" : selectedItems.length > 0 ? "Mixed vendors" : "None selected"}
            />
          </div>

          {/* Table card */}
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search quotation, customer, BCN..."
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="pl-9 h-9 text-sm"
                  />
                  {globalFilter && (
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setGlobalFilter("")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {selectedItems.length > 0 && !canCreatePo && (
                    <p className="text-xs text-amber-700 flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Select items from the same vendor
                    </p>
                  )}

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Button
                          onClick={() => setIsVerificationOpen(true)}
                          disabled={!canCreatePo}
                          size="sm"
                          className="gap-2"
                        >
                          <ShoppingCart className="h-4 w-4" />
                          Create PO
                          {selectedItems.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 text-xs bg-white/20 text-white">
                              {selectedItems.length}
                            </Badge>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!canCreatePo && selectedItems.length > 1 && (
                      <TooltipContent>
                        <p>All selected items must have the same vendor.</p>
                      </TooltipContent>
                    )}
                    {selectedItems.length === 0 && (
                      <TooltipContent>
                        <p>Select at least one item to create a PO.</p>
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => setIsDeletePoOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete PO
                    </Button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id} className="bg-muted/50">
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground h-10"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {columns.map((_, j) => (
                            <TableCell key={j}>
                              <div className="h-4 bg-muted rounded animate-pulse" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row, idx) => (
                        <TableRow
                          key={row.id}
                          data-state={row.getIsSelected() && "selected"}
                          className={cn(
                            "transition-colors",
                            row.getIsSelected()
                              ? "bg-primary/5 hover:bg-primary/8"
                              : idx % 2 === 0
                              ? "bg-background hover:bg-muted/30"
                              : "bg-muted/20 hover:bg-muted/40"
                          )}
                        >
                          {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="py-2.5">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-36 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className="h-9 w-9 opacity-30" />
                            <p className="text-sm font-medium">
                              {globalFilter ? "No items match your search" : "No items require purchasing at this time."}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  <strong>{table.getFilteredSelectedRowModel().rows.length}</strong> of{" "}
                  <strong>{table.getFilteredRowModel().rows.length}</strong> row(s) selected
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs font-medium text-muted-foreground">
                    Page {table.getState().pagination.pageIndex + 1} of{" "}
                    {Math.max(table.getPageCount(), 1)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Dialogs */}
        <VendorVerificationDialog
          isOpen={isVerificationOpen}
          onClose={() => setIsVerificationOpen(false)}
          onConfirm={handleVerificationConfirm}
        />
        <CreatePoDialog
          isOpen={isCreatePoOpen}
          onClose={() => setIsCreatePoOpen(false)}
          items={selectedItems}
          creator={user ? { id: user.id, name: user.name } : null}
          onSuccess={() => { fetchData(); table.resetRowSelection(); }}
          isNewVendor={isNewVendor}
        />
        <QuotationDetailDialog
          isOpen={isDialogLoading || !!selectedQuotation}
          onClose={() => setSelectedQuotation(null)}
          quotation={selectedQuotation}
          deal={selectedDeal}
          salesmen={salesmen}
          cpds={cpds}
        />
        <DeletePoDialog
          isOpen={isDeletePoOpen}
          onClose={() => setIsDeletePoOpen(false)}
          onConfirm={handleDeletePo}
          isDeleting={isDeletingPo}
        />
      </TooltipProvider>
    </>
  );
}