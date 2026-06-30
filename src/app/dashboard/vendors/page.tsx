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
import { Loader2, Plus, Pencil, Trash2, Search, Building2 } from "lucide-react";
import type { Vendor } from "@/lib/types";
import { getVendors, saveVendor, deleteVendor } from "./actions";

const EMPTY: Omit<Vendor, "id" | "createdAt" | "updatedAt"> = {
  name: "",
  vendorCode: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  gstin: "",
  pan: "",
  bankName: "",
  accountNo: "",
  ifsc: "",
  paymentTerms: "Net 30",
  category: "",
  notes: "",
  isActive: true,
};

export default function VendorsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setVendors(await getVendors());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (v: Vendor) => {
    setEditing(v);
    setForm({
      name: v.name || "",
      vendorCode: v.vendorCode || "",
      contactPerson: v.contactPerson || "",
      phone: v.phone || "",
      email: v.email || "",
      address: v.address || "",
      city: v.city || "",
      state: v.state || "",
      pincode: v.pincode || "",
      gstin: v.gstin || "",
      pan: v.pan || "",
      bankName: v.bankName || "",
      accountNo: v.accountNo || "",
      ifsc: v.ifsc || "",
      paymentTerms: v.paymentTerms || "Net 30",
      category: v.category || "",
      notes: v.notes || "",
      isActive: v.isActive !== false,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ variant: "destructive", title: "Name is required" }); return; }
    setSaving(true);
    const result = await saveVendor({ ...form, createdBy: user?.name || "system" }, editing?.id);
    setSaving(false);
    if (result.success) {
      toast({ title: editing ? "Vendor updated" : "Vendor added" });
      setOpen(false);
      load();
    } else {
      toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vendor?")) return;
    setDeleting(id);
    const result = await deleteVendor(id);
    setDeleting(null);
    if (result.success) { toast({ title: "Vendor deleted" }); load(); }
    else toast({ variant: "destructive", title: result.message });
  };

  const filtered = vendors.filter((v) =>
    [v.name, v.vendorCode, v.category, v.city, v.gstin, v.contactPerson]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase()))
  );

  const field = (label: string, key: keyof typeof form, placeholder?: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        placeholder={placeholder || label}
        value={(form[key] as string) || ""}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" /> Vendor Master</h1>
          <p className="text-muted-foreground text-sm">Manage supplier and vendor profiles</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add Vendor</Button>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input className="w-80" placeholder="Search by name, code, city, GST..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Badge variant="secondary">{filtered.length} vendors</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>City</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No vendors found.</TableCell></TableRow>
              ) : filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell className="text-muted-foreground">{v.vendorCode || "-"}</TableCell>
                  <TableCell>{v.category || "-"}</TableCell>
                  <TableCell>{v.contactPerson || "-"}</TableCell>
                  <TableCell>{v.phone || "-"}</TableCell>
                  <TableCell>{v.city || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{v.gstin || "-"}</TableCell>
                  <TableCell>{v.paymentTerms || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={v.isActive !== false ? "default" : "secondary"}>
                      {v.isActive !== false ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleDelete(v.id)} disabled={deleting === v.id}>
                        {deleting === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">{field("Vendor Name *", "name")}</div>
            {field("Vendor Code", "vendorCode", "e.g. VEN-001")}
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category || ""} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {["Fabric", "Hardware", "Accessories", "Service", "Packaging", "Other"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {field("Contact Person", "contactPerson")}
            {field("Phone", "phone")}
            {field("Email", "email")}
            <div className="col-span-2">{field("Address", "address")}</div>
            {field("City", "city")}
            {field("State", "state")}
            {field("Pincode", "pincode")}
            {field("GSTIN", "gstin", "22AAAAA0000A1Z5")}
            {field("PAN", "pan", "AAAAA0000A")}
            <div className="col-span-2 border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Bank Details</p>
            </div>
            {field("Bank Name", "bankName")}
            {field("Account No.", "accountNo")}
            {field("IFSC Code", "ifsc", "HDFC0001234")}
            <div className="space-y-1">
              <Label>Payment Terms</Label>
              <Select value={form.paymentTerms || "Net 30"} onValueChange={(v) => setForm((p) => ({ ...p, paymentTerms: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Immediate", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Advance"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.isActive ? "active" : "inactive"} onValueChange={(v) => setForm((p) => ({ ...p, isActive: v === "active" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Any additional notes..." value={form.notes || ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Update" : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
