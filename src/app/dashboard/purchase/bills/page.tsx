"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Search, FileText, Trash2, Check } from "lucide-react";
import { format } from "date-fns";
import type { VendorBill, VendorBillItem } from "@/lib/types";
import { getVendorBills, getVendorsForSelect, saveVendorBill, updateBillStatus } from "./actions";

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  pending: "outline",
  paid: "default",
  partial: "outline",
  overdue: "destructive",
};

const EMPTY_ITEM: VendorBillItem = { description: "", qty: 1, rate: 0, gst: 18, amount: 0 };

export default function VendorBillsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const [form, setForm] = useState({
    vendorId: "",
    vendorName: "",
    vendorBillNo: "",
    purchaseRequestNo: "",
    date: new Date().toISOString().split("T")[0],
    dueDate: "",
    status: "pending" as VendorBill["status"],
    notes: "",
    items: [{ ...EMPTY_ITEM }],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [b, v] = await Promise.all([getVendorBills(), getVendorsForSelect()]);
      setBills(b);
      setVendors(v);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateItem = (i: number, key: keyof VendorBillItem, val: string | number) => {
    setForm((p) => {
      const items = [...p.items];
      items[i] = { ...items[i], [key]: val };
      const qty = Number(items[i].qty) || 0;
      const rate = Number(items[i].rate) || 0;
      const gst = Number(items[i].gst) || 0;
      items[i].amount = qty * rate * (1 + gst / 100);
      return { ...p, items };
    });
  };

  const totals = () => {
    const subtotal = form.items.reduce((s, it) => {
      const qty = Number(it.qty) || 0;
      const rate = Number(it.rate) || 0;
      return s + qty * rate;
    }, 0);
    const taxAmount = form.items.reduce((s, it) => {
      const qty = Number(it.qty) || 0;
      const rate = Number(it.rate) || 0;
      const gst = Number(it.gst) || 0;
      return s + qty * rate * (gst / 100);
    }, 0);
    return { subtotal, taxAmount, total: subtotal + taxAmount };
  };

  const handleSave = async () => {
    if (!form.vendorName.trim()) { toast({ variant: "destructive", title: "Select a vendor" }); return; }
    const { subtotal, taxAmount, total } = totals();
    setSaving(true);
    const result = await saveVendorBill({
      vendorId: form.vendorId || undefined,
      vendorName: form.vendorName,
      vendorBillNo: form.vendorBillNo || undefined,
      purchaseRequestNo: form.purchaseRequestNo || undefined,
      date: form.date,
      dueDate: form.dueDate || undefined,
      status: form.status,
      items: form.items,
      subtotal,
      taxAmount,
      total,
      notes: form.notes || undefined,
      createdBy: user?.name || "system",
    });
    setSaving(false);
    if (result.success) {
      toast({ title: "Bill saved" });
      setOpen(false);
      load();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleStatusChange = async (id: string, status: VendorBill["status"]) => {
    setUpdating(id);
    await updateBillStatus(id, status);
    setUpdating(null);
    load();
  };

  const filtered = bills.filter((b) =>
    [b.billNo, b.vendorName, b.vendorBillNo, b.status]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPending = filtered.filter((b) => b.status === "pending" || b.status === "overdue").reduce((s, b) => s + b.total, 0);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Vendor Bills</h1>
          <p className="text-muted-foreground text-sm">Track bills received from vendors</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Bill</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Total Bills</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold">{filtered.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Outstanding</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold text-red-600">₹{totalPending.toLocaleString("en-IN")}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input className="w-80" placeholder="Search vendor, bill no, status..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill No</TableHead>
                <TableHead>Vendor Bill No</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No bills found.</TableCell></TableRow>
              ) : filtered.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.billNo}</TableCell>
                  <TableCell className="text-xs">{b.vendorBillNo || "-"}</TableCell>
                  <TableCell className="font-medium">{b.vendorName}</TableCell>
                  <TableCell className="text-sm">{b.date ? format(new Date(b.date), "dd MMM yyyy") : "-"}</TableCell>
                  <TableCell className="text-sm">{b.dueDate ? format(new Date(b.dueDate), "dd MMM yyyy") : "-"}</TableCell>
                  <TableCell className="text-right">₹{(b.subtotal || 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right text-muted-foreground">₹{(b.taxAmount || 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-right font-semibold">₹{(b.total || 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[b.status] as any}>{b.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {b.status !== "paid" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusChange(b.id, "paid")} disabled={updating === b.id}>
                        {updating === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" />Mark Paid</>}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Vendor Bill</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Vendor *</Label>
                <Select value={form.vendorId} onValueChange={(v) => {
                  const vendor = vendors.find((x) => x.id === v);
                  setForm((p) => ({ ...p, vendorId: v, vendorName: vendor?.name || "" }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Vendor's Bill No</Label>
                <Input placeholder="Vendor invoice number" value={form.vendorBillNo} onChange={(e) => setForm((p) => ({ ...p, vendorBillNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Bill Date *</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>PO / PR Reference</Label>
                <Input placeholder="Purchase order / request no" value={form.purchaseRequestNo} onChange={(e) => setForm((p) => ({ ...p, purchaseRequestNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v as VendorBill["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["draft", "pending", "partial", "paid"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => setForm((p) => ({ ...p, items: [...p.items, { ...EMPTY_ITEM }] }))}>
                  <Plus className="h-3 w-3 mr-1" /> Add Line
                </Button>
              </div>
              <div className="rounded border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-16">Qty</TableHead>
                      <TableHead className="w-24">Rate (₹)</TableHead>
                      <TableHead className="w-16">GST%</TableHead>
                      <TableHead className="w-24 text-right">Amount</TableHead>
                      <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.items.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell><Input className="h-7 text-xs" value={item.description} onChange={(e) => updateItem(i, "description", e.target.value)} /></TableCell>
                        <TableCell><Input className="h-7 text-xs w-14" type="number" value={item.qty} onChange={(e) => updateItem(i, "qty", Number(e.target.value))} /></TableCell>
                        <TableCell><Input className="h-7 text-xs w-20" type="number" value={item.rate} onChange={(e) => updateItem(i, "rate", Number(e.target.value))} /></TableCell>
                        <TableCell><Input className="h-7 text-xs w-14" type="number" value={item.gst} onChange={(e) => updateItem(i, "gst", Number(e.target.value))} /></TableCell>
                        <TableCell className="text-right text-sm">₹{(item.amount || 0).toFixed(0)}</TableCell>
                        <TableCell>
                          {form.items.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setForm((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-right space-y-0.5 text-sm">
                <div className="text-muted-foreground">Subtotal: ₹{totals().subtotal.toFixed(2)}</div>
                <div className="text-muted-foreground">Tax: ₹{totals().taxAmount.toFixed(2)}</div>
                <div className="font-bold">Total: ₹{totals().total.toFixed(2)}</div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
