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
import { Loader2, Plus, Trash2, Search, IndianRupee, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import type { PaymentReceived } from "@/lib/types";
import { getPaymentsReceived, addPaymentReceived, deletePaymentReceived } from "./actions";

const PAYMENT_MODES = ["Cash", "Card", "UPI", "Cheque", "NEFT", "RTGS"] as const;

const EMPTY = {
  customerName: "",
  orderNo: "",
  invoiceNo: "",
  amount: "",
  mode: "UPI" as PaymentReceived["mode"],
  referenceNo: "",
  date: new Date().toISOString().split("T")[0],
  notes: "",
};

export default function PaymentsReceivedPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [payments, setPayments] = useState<PaymentReceived[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setPayments(await getPaymentsReceived()); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.customerName.trim()) { toast({ variant: "destructive", title: "Customer name is required" }); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast({ variant: "destructive", title: "Enter a valid amount" }); return; }
    setSaving(true);
    const result = await addPaymentReceived({
      customerName: form.customerName,
      orderNo: form.orderNo || undefined,
      invoiceNo: form.invoiceNo || undefined,
      amount: Number(form.amount),
      mode: form.mode,
      referenceNo: form.referenceNo || undefined,
      date: form.date,
      notes: form.notes || undefined,
      createdBy: user?.name || "system",
    });
    setSaving(false);
    if (result.success) {
      toast({ title: "Payment recorded" });
      setOpen(false);
      setForm(EMPTY);
      load();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this payment record?")) return;
    setDeleting(id);
    const result = await deletePaymentReceived(id);
    setDeleting(null);
    if (result.success) { toast({ title: "Deleted" }); load(); }
    else toast({ variant: "destructive", title: result.message });
  };

  const filtered = payments.filter((p) =>
    [p.paymentNo, p.customerName, p.orderNo, p.invoiceNo, p.mode, p.referenceNo]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const totalReceived = filtered.reduce((s, p) => s + (p.amount || 0), 0);

  const modeColor: Record<string, string> = {
    Cash: "bg-green-100 text-green-800",
    UPI: "bg-blue-100 text-blue-800",
    NEFT: "bg-purple-100 text-purple-800",
    RTGS: "bg-purple-100 text-purple-800",
    Cheque: "bg-amber-100 text-amber-800",
    Card: "bg-sky-100 text-sky-800",
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><IndianRupee className="h-6 w-6" /> Payments Received</h1>
          <p className="text-muted-foreground text-sm">Record and track customer payments</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Record Payment</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Total (filtered)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold">₹{totalReceived.toLocaleString("en-IN")}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Transactions</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input className="w-80" placeholder="Search customer, order, invoice, ref..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order / Invoice</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No payments recorded yet.</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.paymentNo}</TableCell>
                  <TableCell className="text-sm">{p.date ? format(new Date(p.date), "dd MMM yyyy") : "-"}</TableCell>
                  <TableCell className="font-medium">{p.customerName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{[p.orderNo, p.invoiceNo].filter(Boolean).join(" / ") || "-"}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${modeColor[p.mode] || ""}`}>{p.mode}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.referenceNo || "-"}</TableCell>
                  <TableCell className="text-right font-semibold">₹{(p.amount || 0).toLocaleString("en-IN")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{p.notes || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(p.id)} disabled={deleting === p.id}>
                      {deleting === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
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
              <Label>Amount (₹) *</Label>
              <Input type="number" placeholder="0.00" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Payment Mode *</Label>
              <Select value={form.mode} onValueChange={(v) => setForm((p) => ({ ...p, mode: v as PaymentReceived["mode"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Reference / UTR No</Label>
              <Input placeholder="Transaction reference" value={form.referenceNo} onChange={(e) => setForm((p) => ({ ...p, referenceNo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
