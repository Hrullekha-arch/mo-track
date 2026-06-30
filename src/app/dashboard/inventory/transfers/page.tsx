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
import { Loader2, Plus, Search, ArrowRightLeft, Check, X } from "lucide-react";
import { format } from "date-fns";
import type { StockTransfer } from "@/lib/types";
import { getStockTransfers, getStocksForSelect, createStockTransfer, updateTransferStatus } from "./actions";

const STATUS_COLORS: Record<string, string> = { pending: "outline", completed: "default", cancelled: "secondary" };

const LOCATIONS = ["Main Warehouse", "Store Room", "Display Area", "Workshop", "Dispatch Bay", "Other"];

export default function StockTransfersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [stocks, setStocks] = useState<{ id: string; name: string; bcn?: string; unit?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  const [form, setForm] = useState({
    stockId: "",
    stockName: "",
    bcn: "",
    unit: "",
    fromLocation: "",
    toLocation: "",
    quantity: "",
    transferDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([getStockTransfers(), getStocksForSelect()]);
      setTransfers(t);
      setStocks(s);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.stockName) { toast({ variant: "destructive", title: "Select a stock item" }); return; }
    if (!form.fromLocation || !form.toLocation) { toast({ variant: "destructive", title: "Select from and to locations" }); return; }
    if (form.fromLocation === form.toLocation) { toast({ variant: "destructive", title: "From and To locations must be different" }); return; }
    if (!form.quantity || Number(form.quantity) <= 0) { toast({ variant: "destructive", title: "Enter a valid quantity" }); return; }

    setSaving(true);
    const result = await createStockTransfer({
      stockId: form.stockId,
      stockName: form.stockName,
      bcn: form.bcn || undefined,
      unit: form.unit || undefined,
      fromLocation: form.fromLocation,
      toLocation: form.toLocation,
      quantity: Number(form.quantity),
      transferDate: form.transferDate,
      status: "pending",
      requestedBy: user?.name || "system",
      notes: form.notes || undefined,
      createdBy: user?.name || "system",
    });
    setSaving(false);

    if (result.success) {
      toast({ title: "Transfer created" });
      setOpen(false);
      setForm({ stockId: "", stockName: "", bcn: "", unit: "", fromLocation: "", toLocation: "", quantity: "", transferDate: new Date().toISOString().split("T")[0], notes: "" });
      load();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleStatusUpdate = async (id: string, status: StockTransfer["status"]) => {
    setUpdating(id);
    await updateTransferStatus(id, status);
    setUpdating(null);
    toast({ title: `Transfer marked as ${status}` });
    load();
  };

  const filtered = transfers.filter((t) =>
    [t.transferNo, t.stockName, t.bcn, t.fromLocation, t.toLocation, t.status]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowRightLeft className="h-6 w-6" /> Stock Transfers</h1>
          <p className="text-muted-foreground text-sm">Move inventory between locations</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Transfer</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Total Transfers</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold">{filtered.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Pending</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold text-amber-600">{filtered.filter((t) => t.status === "pending").length}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input className="w-80" placeholder="Search item, location, status..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>BCN</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No transfers found.</TableCell></TableRow>
              ) : filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.transferNo}</TableCell>
                  <TableCell className="text-sm">{t.transferDate ? format(new Date(t.transferDate), "dd MMM yyyy") : "-"}</TableCell>
                  <TableCell className="font-medium">{t.stockName}</TableCell>
                  <TableCell className="font-mono text-xs">{t.bcn || "-"}</TableCell>
                  <TableCell className="text-sm">{t.fromLocation}</TableCell>
                  <TableCell className="text-sm">{t.toLocation}</TableCell>
                  <TableCell className="text-right">{t.quantity} {t.unit || ""}</TableCell>
                  <TableCell className="text-sm">{t.requestedBy}</TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[t.status] as any}>{t.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {t.status === "pending" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(t.id, "completed")} disabled={updating === t.id}>
                          {updating === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" />Done</>}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleStatusUpdate(t.id, "cancelled")} disabled={updating === t.id}>
                          <X className="h-3 w-3 mr-1" />Cancel
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Stock Transfer</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Stock Item *</Label>
              <Select value={form.stockId} onValueChange={(v) => {
                const s = stocks.find((x) => x.id === v);
                setForm((p) => ({ ...p, stockId: v, stockName: s?.name || "", bcn: s?.bcn || "", unit: s?.unit || "" }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select stock item" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {stocks.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.bcn ? ` (${s.bcn})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>From Location *</Label>
              <Select value={form.fromLocation} onValueChange={(v) => setForm((p) => ({ ...p, fromLocation: v }))}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>{LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>To Location *</Label>
              <Select value={form.toLocation} onValueChange={(v) => setForm((p) => ({ ...p, toLocation: v }))}>
                <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                <SelectContent>{LOCATIONS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Quantity *</Label>
              <Input type="number" placeholder="0" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Transfer Date *</Label>
              <Input type="date" value={form.transferDate} onChange={(e) => setForm((p) => ({ ...p, transferDate: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Reason for transfer..." value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
