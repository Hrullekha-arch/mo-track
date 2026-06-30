"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, AlertTriangle, Settings2, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReorderItem } from "./actions";
import { getReorderItems, setReorderPoint, getAllStocksBasic } from "./actions";

export default function ReorderPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [allStocks, setAllStocks] = useState<{ id: string; name: string; bcn?: string; availableQty: number; reorderPoint?: number; reorderQty?: number; unit?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [configSearch, setConfigSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { rp: string; rq: string }>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([getReorderItems(), getAllStocksBasic()]);
      setItems(r);
      setAllStocks(s);
      const init: Record<string, { rp: string; rq: string }> = {};
      s.forEach((st) => {
        init[st.id] = { rp: String(st.reorderPoint ?? ""), rq: String(st.reorderQty ?? "") };
      });
      setEditValues(init);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSaveConfig = async (stockId: string) => {
    const vals = editValues[stockId];
    if (!vals) return;
    const rp = Number(vals.rp) || 0;
    const rq = Number(vals.rq) || 0;
    setSaving(stockId);
    const result = await setReorderPoint(stockId, rp, rq);
    setSaving(null);
    if (result.success) {
      toast({ title: "Reorder point saved" });
      load();
    } else {
      toast({ variant: "destructive", title: result.message });
    }
  };

  const filtered = items.filter((i) =>
    [i.name, i.bcn, i.category, i.supplierCompanyName]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const alertItems = filtered.filter((i) => i.needsReorder);
  const okItems = filtered.filter((i) => !i.needsReorder);

  const configFiltered = allStocks.filter((s) =>
    [s.name, s.bcn].some((f) => f?.toLowerCase().includes(configSearch.toLowerCase()))
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><PackageSearch className="h-6 w-6" /> Reorder Points</h1>
          <p className="text-muted-foreground text-sm">Monitor low stock and configure reorder alerts</p>
        </div>
        <Button variant="outline" onClick={() => setConfigOpen(true)}><Settings2 className="h-4 w-4 mr-1" /> Configure</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className={alertItems.length > 0 ? "border-red-300 bg-red-50 dark:bg-red-950/20" : ""}>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
            {alertItems.length > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />} Needs Reorder
          </CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className={cn("text-xl font-bold", alertItems.length > 0 && "text-red-600")}>{alertItems.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">OK</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold text-green-600">{okItems.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground">Total Monitored</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><div className="text-xl font-bold">{items.length}</div></CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input className="w-80" placeholder="Search item name, BCN..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {alertItems.length > 0 && (
        <Card className="border-red-300">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Items Below Reorder Point</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>BCN</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reorder At</TableHead>
                  <TableHead className="text-right">Reorder Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertItems.map((it) => (
                  <TableRow key={it.id} className="bg-red-50/50 dark:bg-red-950/10">
                    <TableCell className="font-medium">{it.name}</TableCell>
                    <TableCell className="font-mono text-xs">{it.bcn || "-"}</TableCell>
                    <TableCell className="text-sm">{it.supplierCompanyName || "-"}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">{it.availableQty} {it.unit || ""}</TableCell>
                    <TableCell className="text-right">{it.reorderPoint} {it.unit || ""}</TableCell>
                    <TableCell className="text-right">{it.reorderQty} {it.unit || ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">All Monitored Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>BCN</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reorder At</TableHead>
                <TableHead className="text-right">Reorder Qty</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No items configured. Click Configure to set reorder points.</TableCell></TableRow>
              ) : filtered.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="font-mono text-xs">{it.bcn || "-"}</TableCell>
                  <TableCell className="text-sm">{it.category || "-"}</TableCell>
                  <TableCell className="text-right">{it.availableQty} {it.unit || ""}</TableCell>
                  <TableCell className="text-right">{it.reorderPoint} {it.unit || ""}</TableCell>
                  <TableCell className="text-right">{it.reorderQty} {it.unit || ""}</TableCell>
                  <TableCell>
                    <Badge variant={it.needsReorder ? "destructive" : "default"}>
                      {it.needsReorder ? "Reorder Now" : "OK"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Configure Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Configure Reorder Points</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search items..." value={configSearch} onChange={(e) => setConfigSearch(e.target.value)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="w-28">Reorder At</TableHead>
                  <TableHead className="w-28">Reorder Qty</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configFiltered.slice(0, 50).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{s.name}</div>
                      {s.bcn && <div className="text-xs text-muted-foreground font-mono">{s.bcn}</div>}
                    </TableCell>
                    <TableCell className="text-right text-sm">{s.availableQty} {s.unit || ""}</TableCell>
                    <TableCell>
                      <Input
                        className="h-7 text-xs"
                        type="number"
                        placeholder="0"
                        value={editValues[s.id]?.rp ?? ""}
                        onChange={(e) => setEditValues((p) => ({ ...p, [s.id]: { ...p[s.id], rp: e.target.value } }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 text-xs"
                        type="number"
                        placeholder="0"
                        value={editValues[s.id]?.rq ?? ""}
                        onChange={(e) => setEditValues((p) => ({ ...p, [s.id]: { ...p[s.id], rq: e.target.value } }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSaveConfig(s.id)} disabled={saving === s.id}>
                        {saving === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfigOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
