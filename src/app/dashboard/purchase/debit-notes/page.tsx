"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createDebitNoteAction,
  deleteFailedDebitNoteAction,
  retryDebitNoteSyncAction,
  type DebitNoteLineInput,
} from "./actions";

type VendorOption = {
  id: string;
  name: string;
  gstNo?: string;
};

type ItemOption = {
  id: string;
  name: string;
  sku?: string;
  purchaseRate?: number;
  rate?: number;
  unit?: string;
  taxId?: string;
};

type BillOption = {
  id: string;
  number: string;
  referenceNumber?: string;
  date?: string;
  total: number;
  balance: number;
};

type DebitNoteRow = {
  id: string;
  vendorName: string;
  poNumber?: string | null;
  billNumber?: string | null;
  date: string;
  reason: string;
  total: number;
  zohoSyncStatus?: "pending" | "synced" | "failed";
  zohoSyncError?: string | null;
  zohoNumber?: string | null;
  createdBy?: { name?: string };
};

const today = () => new Date().toISOString().slice(0, 10);

const currency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export default function DebitNotesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<DebitNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);
  const [vendor, setVendor] = useState<VendorOption | null>(null);
  const [billSearch, setBillSearch] = useState("");
  const [billOptions, setBillOptions] = useState<BillOption[]>([]);
  const [selectedBill, setSelectedBill] = useState<BillOption | null>(null);
  const [loadingBills, setLoadingBills] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemOption | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [rate, setRate] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<DebitNoteLineInput[]>([]);

  useEffect(() => {
    const notesQuery = query(collection(db, "debitNotes"), orderBy("createdAt", "desc"));
    return onSnapshot(
      notesQuery,
      (snapshot) => {
        setRows(
          snapshot.docs.map((note) => ({
            id: note.id,
            ...(note.data() as Omit<DebitNoteRow, "id">),
          }))
        );
        setLoading(false);
      },
      (error) => {
        console.error("Debit-note listener failed:", error);
        setLoading(false);
      }
    );
  }, []);

  useEffect(() => {
    if (vendor || vendorSearch.trim().length < 2) {
      setVendorOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/zoho/vendors?search=${encodeURIComponent(vendorSearch)}`);
      const payload = await response.json();
      setVendorOptions(Array.isArray(payload?.vendors) ? payload.vendors : []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [vendor, vendorSearch]);

  useEffect(() => {
    setSelectedBill(null);
    setBillSearch("");
    setBillOptions([]);
  }, [vendor?.id]);

  useEffect(() => {
    if (!vendor?.id || selectedBill) {
      setBillOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoadingBills(true);
      try {
        const params = new URLSearchParams({ vendorId: vendor.id });
        if (billSearch.trim()) params.set("search", billSearch.trim());
        const response = await fetch(`/api/zoho/bills?${params.toString()}`);
        const payload = await response.json();
        setBillOptions(Array.isArray(payload?.bills) ? payload.bills : []);
      } finally {
        setLoadingBills(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [billSearch, selectedBill, vendor?.id]);

  useEffect(() => {
    if (selectedItem || itemSearch.trim().length < 2) {
      setItemOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        search: itemSearch,
        usage: "purchase",
      });
      if (vendor?.id) params.set("vendorId", vendor.id);
      const response = await fetch(`/api/zoho/items?${params.toString()}`);
      const payload = await response.json();
      setItemOptions(Array.isArray(payload?.items) ? payload.items : []);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [itemSearch, selectedItem, vendor?.id]);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity * item.rate, 0),
    [items]
  );

  const addItem = () => {
    const parsedQuantity = Number(quantity);
    const parsedRate = Number(rate);
    if (
      !selectedItem ||
      !Number.isFinite(parsedQuantity) ||
      parsedQuantity <= 0 ||
      !Number.isFinite(parsedRate) ||
      parsedRate < 0
    ) {
      toast({
        variant: "destructive",
        title: "Invalid item",
        description: "Select a Zoho item and enter valid quantity and rate.",
      });
      return;
    }
    setItems((current) => [
      ...current,
      {
        zohoItemId: selectedItem.id,
        itemName: selectedItem.name,
        sku: selectedItem.sku,
        description: selectedItem.name,
        quantity: parsedQuantity,
        rate: parsedRate,
        taxId: selectedItem.taxId,
      },
    ]);
    setSelectedItem(null);
    setItemSearch("");
    setQuantity("1");
    setRate("");
  };

  const resetForm = () => {
    setVendor(null);
    setVendorSearch("");
    setSelectedBill(null);
    setBillSearch("");
    setBillOptions([]);
    setPoNumber("");
    setReferenceNumber("");
    setDate(today());
    setReason("");
    setItems([]);
    setSelectedItem(null);
    setItemSearch("");
    setQuantity("1");
    setRate("");
  };

  const createNote = async () => {
    if (!user?.id || !vendor) return;
    setSaving(true);
    try {
      const result = await createDebitNoteAction(
        {
          vendorName: vendor.name,
          zohoVendorId: vendor.id,
          zohoBillId: selectedBill?.id || "",
          billNumber: selectedBill?.number || "",
          billBalance: selectedBill?.balance || 0,
          poNumber,
          referenceNumber,
          date,
          reason,
          items,
        },
        { id: user.id, name: user.name || "User" }
      );
      toast({
        title: result.success ? "Debit note created" : "Creation failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) resetForm();
    } finally {
      setSaving(false);
    }
  };

  const retry = async (id: string) => {
    if (!user?.id) return;
    setRetryingId(id);
    try {
      const result = await retryDebitNoteSyncAction(id, {
        id: user.id,
        name: user.name || "User",
      });
      toast({
        title: result.success ? "Zoho sync completed" : "Zoho sync failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } finally {
      setRetryingId(null);
    }
  };

  const deleteFailedNote = async (id: string) => {
    if (!user?.id || !window.confirm("Delete this failed debit note?")) return;
    setDeletingId(id);
    try {
      const result = await deleteFailedDebitNoteAction(id, {
        id: user.id,
        name: user.name || "User",
      });
      toast({
        title: result.success ? "Debit note deleted" : "Delete failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <header className="border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
            <ReceiptText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Purchase Debit Notes</h1>
            <p className="text-sm text-muted-foreground">
              Save in Mo Track first, then transfer to Zoho Books as a vendor credit.
            </p>
          </div>
        </div>
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Create Debit Note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative space-y-2">
              <Label>Zoho Vendor</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={vendorSearch}
                  onChange={(event) => {
                    setVendor(null);
                    setVendorSearch(event.target.value);
                  }}
                  placeholder="Search vendor..."
                  className="pl-9"
                />
              </div>
              {vendorOptions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white shadow-lg">
                  {vendorOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setVendor(option);
                        setVendorSearch(option.name);
                        setVendorOptions([]);
                      }}
                    >
                      <span className="block text-sm font-medium">{option.name}</span>
                      {option.gstNo && (
                        <span className="block text-xs text-muted-foreground">{option.gstNo}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative space-y-2">
              <Label>Associated Bill Number</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={billSearch}
                  disabled={!vendor}
                  onFocus={() => {
                    if (selectedBill) {
                      setSelectedBill(null);
                      setBillSearch("");
                    }
                  }}
                  onChange={(event) => {
                    setSelectedBill(null);
                    setBillSearch(event.target.value);
                  }}
                  placeholder={vendor ? "Select vendor bill..." : "Select vendor first"}
                  className="pl-9"
                />
                {loadingBills && (
                  <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {billOptions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-white shadow-lg">
                  {billOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setSelectedBill(option);
                        setBillSearch(option.number);
                        setBillOptions([]);
                      }}
                    >
                      <span className="block text-sm font-medium">{option.number}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[option.date, `Balance ${currency(option.balance)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {vendor && !loadingBills && !selectedBill && billOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Type to search this vendor&apos;s open Zoho bills.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>PO Number</Label>
              <Input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reference Number</Label>
              <Input
                value={referenceNumber}
                onChange={(event) => setReferenceNumber(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_120px_150px_auto] lg:items-end">
            <div className="relative space-y-2">
              <Label>Zoho Purchase Item</Label>
              <Input
                value={itemSearch}
                onChange={(event) => {
                  setSelectedItem(null);
                  setItemSearch(event.target.value);
                }}
                placeholder="Search item or SKU..."
              />
              {itemOptions.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white shadow-lg">
                  {itemOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setSelectedItem(option);
                        setItemSearch(option.sku ? `${option.sku} - ${option.name}` : option.name);
                        setRate(String(option.purchaseRate ?? option.rate ?? ""));
                        setItemOptions([]);
                      }}
                    >
                      <span className="block text-sm font-medium">
                        {option.sku ? `${option.sku} - ${option.name}` : option.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {currency(option.purchaseRate ?? option.rate ?? 0)} {option.unit || ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rate</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(event) => setRate(event.target.value)}
              />
            </div>
            <Button type="button" variant="outline" onClick={addItem}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="w-14" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Add the products being returned or adjusted.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item, index) => (
                    <TableRow key={`${item.zohoItemId}-${index}`}>
                      <TableCell>
                        <p className="font-medium">{item.itemName}</p>
                        {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{currency(item.rate)}</TableCell>
                      <TableCell className="font-medium">
                        {currency(item.quantity * item.rate)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="Remove item"
                          onClick={() =>
                            setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
                          }
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Returned material, rate difference, damaged supply..."
                className="min-h-24"
              />
            </div>
            <div className="flex flex-col justify-between rounded-md border bg-slate-50 p-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Debit Note Total</p>
                <p className="mt-1 text-2xl font-bold">{currency(total)}</p>
              </div>
              <Button
                className="mt-4 bg-teal-700 hover:bg-teal-800"
                disabled={
                  saving || !vendor || !selectedBill || !reason.trim() || items.length === 0
                }
                onClick={createNote}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ReceiptText className="mr-2 h-4 w-4" />
                )}
                Create and Sync
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Debit Note Register</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Bill / PO</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Zoho Debit Note</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No debit notes created.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.vendorName}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.billNumber || "—"}</p>
                      {row.poNumber && (
                        <p className="text-xs text-muted-foreground">PO {row.poNumber}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 truncate">{row.reason}</TableCell>
                    <TableCell className="font-medium">{currency(row.total)}</TableCell>
                    <TableCell>{row.zohoNumber || "Not created"}</TableCell>
                    <TableCell>
                      {row.zohoSyncStatus === "synced" ? (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          Synced
                        </Badge>
                      ) : row.zohoSyncStatus === "failed" ? (
                        <Badge className="bg-red-50 text-red-700 hover:bg-red-50">
                          <AlertCircle className="mr-1 h-3.5 w-3.5" />
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                      {row.zohoSyncError && (
                        <p className="mt-1 max-w-52 truncate text-xs text-red-600">
                          {row.zohoSyncError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.zohoSyncStatus === "failed" && (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            title="Retry Zoho sync"
                            disabled={retryingId === row.id || deletingId === row.id}
                            onClick={() => void retry(row.id)}
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${
                                retryingId === row.id ? "animate-spin" : ""
                              }`}
                            />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            title="Delete failed debit note"
                            aria-label="Delete failed debit note"
                            disabled={retryingId === row.id || deletingId === row.id}
                            onClick={() => void deleteFailedNote(row.id)}
                          >
                            {deletingId === row.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-red-600" />
                            )}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
