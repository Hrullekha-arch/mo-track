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
import { Loader2, Plus, Search, RotateCcw, Check, X, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { SalesReturn, SalesReturnItem } from "@/lib/types";
import { getSalesReturns, createSalesReturn, updateReturnStatus } from "./actions";

const STATUS_COLORS: Record<string, string> = {
  pending: "outline",
  approved: "default",
  processed: "default",
  rejected: "destructive",
};

const EMPTY_ITEM: SalesReturnItem = { description: "", qty: 1, rate: 0, amount: 0 };

const RETURN_REASONS = [
  "Damaged goods",
  "Wrong item delivered",
  "Quality issue",
  "Customer changed mind",
  "Measurement error",
  "Duplicate order",
  "Other",
];

export default function SalesReturnPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState<{ id: string; returnNo: string } | null>(null);
  const [creditNoteNo, setCreditNoteNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerName: "",
    orderNo: "",
    invoiceNo: "",
    returnDate: new Date().toISOString().split("T")[0],
    reason: "",
    notes: "",
    items: [{ ...EMPTY_ITEM }],
  });

  const load = async () => {
    setLoading(true);
    try { setReturns(await getSalesReturns()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const updateItem = (i: number, key: keyof SalesReturnItem, val: string | number) => {
    setForm((p) => {
      const items = [...p.items];
      items[i] = { ...items[i], [key]: val };
      items[i].amount = (Number(items[i].qty) || 0) * (Number(items[i].rate) || 0);
      return { ...p, items };
    });
  };

  const total = form.items.reduce((s, it) => s + (Number(it.qty) * Number(it.rate) || 0), 0);

  const handleSave = async () => {
    if (!form.customerName.trim()) { toast({ variant: "destructive", title: "Customer name required" }); return; }
    if (!form.reason) { toast({ variant: "destructive", title: "Select a return reason" }); return; }
    setSaving(true);
    const result = await createSalesReturn({
      customerName: form.customerName,
      orderNo: form.orderNo || undefined,
      invoiceNo: form.invoiceNo || undefined,
      returnDate: form.returnDate,
      reason: form.reason,
      items: form.items,
      total,
      status: "pending",
      notes: form.notes || undefined,
      createdBy: user?.name || "system",
    });
    setSaving(false);
    if (result.success) {
      toast({ title: "Return request created" });
      setOpen(false);
      setForm({ customerName: "", orderNo: "", invoiceNo: "", returnDate: new Date().toISOString().split("T")[0], reason: "", notes: "", items: [{ ...EMPTY_ITEM }] });
      load();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleApprove = async () => {
    if (!approveOpen) return;
    setUpdating(approveOpen.id);
    await updateReturnStatus(approveOpen.id, "approved", creditNoteNo || undefined);
    setUpdating(null);
    setApproveOpen(null);
    setCreditNoteNo("");
    toast({ title: "Return approved" });
    load();
  };

  const handleReject = async (id: string) => {
    if (!confirm("Reject this return?")) return;
    setUpdating(id);
    await updateReturnStatus(id, "rejected");
    setUpdating(null);
    toast({ title: "Return rejected" });
    load();
  };

  const filtered = returns.filter((r) =>
    [r.returnNo, r.customerName, r.orderNo, r.invoiceNo, r.status, r.reason]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const pendingTotal = filtered.filter((r) => r.status === "pending").reduce((s, r) => s + r.total, 0);

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><RotateCcw className="h-6 w-6" /> Sales Returns</h1>
          <p className="text-muted-foreground text-sm">Manage customer return requests and credit notes</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Return</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Total Returns</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold">{filtered.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Pending Value</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold text-amber-600">₹{pendingTotal.toLocaleString("en-IN")}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input className="w-80" placeholder="Search customer, order, reason..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order / Invoice</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Credit Note</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No returns found.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                  <TableCell className="text-sm">{r.returnDate ? format(new Date(r.returnDate), "dd MMM yyyy") : "-"}</TableCell>
                  <TableCell className="font-medium">{r.customerName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[r.orderNo, r.invoiceNo].filter(Boolean).join(" / ") || "-"}</TableCell>
                  <TableCell className="text-sm">{r.reason}</TableCell>
                  <TableCell className="text-right font-semibold">₹{(r.total || 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="font-mono text-xs">{r.creditNoteNo || "-"}</TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[r.status] as any}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setApproveOpen({ id: r.id, returnNo: r.returnNo }); setCreditNoteNo(""); }} disabled={updating === r.id}>
                          <Check className="h-3 w-3 mr-1" />Approve
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleReject(r.id)} disabled={updating === r.id}>
                          {updating === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><X className="h-3 w-3 mr-1" />Reject</>}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Return Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Sales Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Customer Name *</Label>
                <Input placeholder="Customer name" value={form.customerName} onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Order No</Label>
                <Input placeholder="e.g. ORD-1234" value={form.orderNo} onChange={(e) => setForm((p) => ({ ...p, orderNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Invoice No</Label>
                <Input placeholder="e.g. INV-1234" value={form.invoiceNo} onChange={(e) => setForm((p) => ({ ...p, invoiceNo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Return Date *</Label>
                <Input type="date" value={form.returnDate} onChange={(e) => setForm((p) => ({ ...p, returnDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Return Reason *</Label>
                <Select value={form.reason} onValueChange={(v) => setForm((p) => ({ ...p, reason: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>{RETURN_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Return Items</Label>
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
              <div className="text-right font-semibold mt-1">Total: ₹{total.toFixed(2)}</div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Additional notes..." value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve + Credit Note Dialog */}
      <Dialog open={!!approveOpen} onOpenChange={() => setApproveOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Approve Return {approveOpen?.returnNo}</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>Credit Note No (optional)</Label>
            <Input placeholder="e.g. CN-0001" value={creditNoteNo} onChange={(e) => setCreditNoteNo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveOpen(null)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={!!updating}>
              {updating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
