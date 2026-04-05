"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { PlusCircle, Pencil, Trash2, ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
import {
  getFurnitureDetailsAction,
  saveFurnitureDetailAction,
  updateFurnitureDetailAction,
  deleteFurnitureDetailAction,
  uploadFurnitureImageAction,
  type FurnitureDetail,
  type FurnitureDetailPayload,
  type FurnitureVariant,
  type MeasurementValues,
} from "./actions";

// ─── Field definitions ────────────────────────────────────────────────────────
const MEASUREMENT_FIELDS: { key: keyof MeasurementValues; label: string; unit: string }[] = [
  { key: "fabric", label: "FABRIC", unit: "IN MTR." },
  { key: "labourFullMaterialChange", label: "LABOUR (FULL MATERIAL CHANGE)", unit: "" },
  { key: "labourHalfMaterialChange", label: "LABOUR (HALF MATERIAL CHANGE)", unit: "" },
  { key: "foamFull", label: "FOAM (FULL)", unit: "" },
  { key: "foamHalf", label: "FOAM (HALF)", unit: "" },
  { key: "lace", label: "LACE", unit: "IN MTR." },
  { key: "fancyDori", label: "FANCY DORI", unit: "" },
  { key: "fringe", label: "FRINGE", unit: "IN MTR." },
  { key: "pollyfillKg", label: "POLLYFILL", unit: "IN KG" },
  { key: "pollyfillMtr", label: "POLLYFILL", unit: "IN MTR." },
  { key: "vall", label: "VALL", unit: "IN MTR." },
  { key: "others", label: "OTHERS", unit: "" },
  { key: "bolstic", label: "BOLSTIC", unit: "IN GM" },
  { key: "markin", label: "MARKIN", unit: "IN MTR." },
  { key: "casement", label: "CASEMENT", unit: "IN MTR." },
  { key: "elastic2Inch", label: 'ELASTIC 2"', unit: "MTR." },
  { key: "elastic3Inch", label: 'ELASTIC 3"', unit: "MTR." },
  { key: "jute", label: "JUTE", unit: "ROLL" },
  { key: "zip", label: "ZIP", unit: "IN MTR." },
  { key: "valcro", label: "VALCRO", unit: "IN MTR." },
  { key: "hessian", label: "HESSIAN", unit: "IN MTR." },
  { key: "tingleNail", label: "TINGLE NAIL", unit: "" },
  { key: "cardBoard", label: "CARD BOARD", unit: "IN MTR." },
  { key: "pipingDori", label: "PIPING DORI", unit: "IN MTR." },
  { key: "springs", label: "SPRINGS", unit: "" },
  { key: "crownNailSilver", label: "CROWN NAIL SILVER", unit: "" },
  { key: "crownNailGold", label: "CROWN NAIL GOLD", unit: "" },
  { key: "crownNailAntiqueGold", label: "CROWN NAIL ANTIQUE GOLD", unit: "IN PACK" },
  { key: "crownNailCopper", label: "CROWN NAIL COPPER", unit: "" },
  { key: "button", label: "BUTTON", unit: "" },
  { key: "glueStick", label: "GLUE STICK", unit: "IN PIECE" },
  { key: "stapplerPin", label: "STAPPLER PIN", unit: "IN STRIPS" },
  { key: "stichingThread", label: "STICHING THREAD", unit: "IN QTY." },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function emptyMeasurements(): MeasurementValues {
  return Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, ""])) as MeasurementValues;
}

function emptyVariant(): FurnitureVariant {
  return { variantName: "", ...emptyMeasurements() };
}

async function compressAndEncodeImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1280;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      resolve({ base64, mimeType: "image/jpeg" });
    };
    img.src = url;
  });
}

// ─── Measurement Grid ─────────────────────────────────────────────────────────
function MeasurementGrid({
  values,
  onChange,
}: {
  values: MeasurementValues;
  onChange: (key: keyof MeasurementValues, val: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {MEASUREMENT_FIELDS.map((f) => (
        <div key={f.key}>
          <Label className="text-xs leading-tight">
            {f.label}
            {f.unit ? <span className="text-muted-foreground ml-1">({f.unit})</span> : null}
          </Label>
          <Input
            type="number"
            min={0}
            step="any"
            className="mt-1 h-8 text-sm"
            placeholder="0"
            value={values[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Add/Edit Dialog ──────────────────────────────────────────────────────────
function FurnitureFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: FurnitureDetail | null;
  onSaved: () => void;
}) {
  const isEdit = Boolean(initial);
  const [productCategory, setProductCategory] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [measurements, setMeasurements] = useState<MeasurementValues>(emptyMeasurements());
  const [variants, setVariants] = useState<FurnitureVariant[]>([]);
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset / populate form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setProductCategory(initial.productCategory);
      setImagePreview(initial.productImageUrl ?? "");
      const m = emptyMeasurements();
      MEASUREMENT_FIELDS.forEach((f) => {
        (m as any)[f.key] = (initial as any)[f.key] ?? "";
      });
      setMeasurements(m);
      setVariants(initial.variants ?? []);
    } else {
      setProductCategory("");
      setImageFile(null);
      setImagePreview("");
      setMeasurements(emptyMeasurements());
      setVariants([]);
      setExpandedVariants(new Set());
    }
  }, [open, initial]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const updateMeasurement = (key: keyof MeasurementValues, val: string) => {
    setMeasurements((prev) => ({ ...prev, [key]: val }));
  };

  const addVariant = () => {
    setVariants((prev) => [...prev, emptyVariant()]);
    setExpandedVariants((prev) => new Set([...prev, variants.length]));
  };

  const removeVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
    setExpandedVariants((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => { if (i !== index) next.add(i > index ? i - 1 : i); });
      return next;
    });
  };

  const updateVariantField = (index: number, key: keyof FurnitureVariant, val: string) => {
    setVariants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: val };
      return next;
    });
  };

  const toggleVariant = (index: number) => {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const handleSave = async () => {
    if (!productCategory.trim()) {
      toast({ variant: "destructive", title: "Product Category is required." });
      return;
    }
    setSaving(true);
    try {
      let productImageUrl = initial?.productImageUrl ?? "";
      if (imageFile) {
        const { base64, mimeType } = await compressAndEncodeImage(imageFile);
        productImageUrl = await uploadFurnitureImageAction(imageFile.name, mimeType, base64);
      }

      const payload: FurnitureDetailPayload = {
        productCategory: productCategory.trim(),
        productImageUrl,
        ...measurements,
        variants,
      };

      if (isEdit && initial) {
        const res = await updateFurnitureDetailAction(initial.id, payload);
        if (!res.success) throw new Error(res.message);
        toast({ title: "Updated successfully." });
      } else {
        const res = await saveFurnitureDetailAction(payload);
        if (!res.success) throw new Error(res.message);
        toast({ title: "Saved successfully." });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit" : "Add"} Furniture Detail</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] pr-3">
          <div className="space-y-6 py-2">
            {/* Basic Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Product Category *</Label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Sofa, Chair, Bed..."
                  value={productCategory}
                  onChange={(e) => setProductCategory(e.target.value)}
                />
              </div>
              <div>
                <Label>Product Image</Label>
                <div className="mt-1 flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {imagePreview ? "Change Image" : "Upload Image"}
                  </Button>
                  {imagePreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-12 w-12 rounded-md border object-cover"
                    />
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
              </div>
            </div>

            {/* Main Measurements */}
            <div>
              <h3 className="mb-3 font-semibold text-sm">Main Measurements</h3>
              <MeasurementGrid values={measurements} onChange={updateMeasurement} />
            </div>

            {/* Variants */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Variants</h3>
                <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                  <PlusCircle className="mr-1 h-4 w-4" />
                  Add Variant
                </Button>
              </div>

              <div className="space-y-3">
                {variants.map((variant, index) => (
                  <div key={index} className="rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between px-4 py-2">
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-2 text-sm font-medium text-left"
                        onClick={() => toggleVariant(index)}
                      >
                        {expandedVariants.has(index) ? (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        )}
                        Variant #{index + 1}
                        {variant.variantName && (
                          <span className="text-muted-foreground ml-1">— {variant.variantName}</span>
                        )}
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeVariant(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {expandedVariants.has(index) && (
                      <div className="px-4 pb-4 space-y-3 border-t pt-3">
                        <div>
                          <Label className="text-xs">Variant Name</Label>
                          <Input
                            className="mt-1 h-8 text-sm"
                            placeholder="e.g. 2-Seater, 3-Seater..."
                            value={variant.variantName}
                            onChange={(e) => updateVariantField(index, "variantName", e.target.value)}
                          />
                        </div>
                        <MeasurementGrid
                          values={variant}
                          onChange={(key, val) => updateVariantField(index, key, val)}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {variants.length === 0 && (
                  <p className="text-sm text-muted-foreground italic text-center py-4">
                    No variants added yet. Click "Add Variant" to add one.
                  </p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Row detail expansion ─────────────────────────────────────────────────────
function MeasurementCell({ value }: { value?: string }) {
  if (!value || value === "" || value === "0") {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span>{value}</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FurnitureDetailsPage() {
  const [records, setRecords] = useState<FurnitureDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FurnitureDetail | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    const data = await getFurnitureDetailsAction();
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => { loadRecords(); }, []);

  const openAdd = () => { setEditRecord(null); setDialogOpen(true); };
  const openEdit = (r: FurnitureDetail) => { setEditRecord(r); setDialogOpen(true); };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const res = await deleteFurnitureDetailAction(deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (res.success) {
      toast({ title: "Deleted successfully." });
      loadRecords();
    } else {
      toast({ variant: "destructive", title: res.message });
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Furniture Details</h1>
          <p className="text-sm text-muted-foreground">Upload measurement data for furniture products</p>
        </div>
        <Button onClick={openAdd}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Product
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading...
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <p>No furniture details added yet.</p>
          <Button variant="outline" onClick={openAdd}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add First Product
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Horizontal scroll wrapper */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1800px]">
              <thead>
                <tr className="bg-muted/70 text-left">
                  <th className="sticky left-0 z-10 bg-muted/70 px-3 py-2 border-b border-r w-8">#</th>
                  <th className="sticky left-8 z-10 bg-muted/70 px-3 py-2 border-b border-r min-w-[140px]">
                    PRODUCT CATEGORY
                  </th>
                  <th className="px-3 py-2 border-b border-r w-16">IMAGE</th>
                  {MEASUREMENT_FIELDS.map((f) => (
                    <th key={f.key} className="px-2 py-2 border-b border-r whitespace-nowrap text-center min-w-[90px]">
                      <span className="block">{f.label}</span>
                      {f.unit && <span className="block text-muted-foreground font-normal">{f.unit}</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2 border-b text-center min-w-[90px]">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record, idx) => (
                  <>
                    {/* Main row */}
                    <tr
                      key={record.id}
                      className="hover:bg-muted/30 border-b cursor-pointer"
                      onClick={() => toggleRow(record.id)}
                    >
                      <td className="sticky left-0 z-10 bg-background px-3 py-2 border-r text-muted-foreground">
                        {idx + 1}
                      </td>
                      <td className="sticky left-8 z-10 bg-background px-3 py-2 border-r font-medium">
                        <div className="flex items-center gap-1">
                          {(record.variants?.length ?? 0) > 0 && (
                            expandedRows.has(record.id)
                              ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                              : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          {record.productCategory}
                          {(record.variants?.length ?? 0) > 0 && (
                            <span className="ml-1 text-muted-foreground">
                              ({record.variants!.length} variant{record.variants!.length > 1 ? "s" : ""})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 border-r">
                        {record.productImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={record.productImageUrl}
                            alt={record.productCategory}
                            className="h-10 w-10 rounded object-cover border"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      {MEASUREMENT_FIELDS.map((f) => (
                        <td key={f.key} className="px-2 py-2 border-r text-center">
                          <MeasurementCell value={(record as any)[f.key]} />
                        </td>
                      ))}
                      <td
                        className="px-3 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(record)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteId(record.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {/* Variant rows */}
                    {expandedRows.has(record.id) &&
                      record.variants?.map((variant, vIdx) => (
                        <tr
                          key={`${record.id}-v${vIdx}`}
                          className="bg-muted/20 border-b"
                        >
                          <td className="sticky left-0 z-10 bg-muted/20 px-3 py-2 border-r text-muted-foreground" />
                          <td className="sticky left-8 z-10 bg-muted/20 px-3 py-2 border-r pl-8 text-muted-foreground italic">
                            ↳ {variant.variantName || `Variant ${vIdx + 1}`}
                          </td>
                          <td className="px-3 py-2 border-r" />
                          {MEASUREMENT_FIELDS.map((f) => (
                            <td key={f.key} className="px-2 py-2 border-r text-center">
                              <MeasurementCell value={(variant as any)[f.key]} />
                            </td>
                          ))}
                          <td className="px-3 py-2" />
                        </tr>
                      ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <FurnitureFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editRecord}
        onSaved={loadRecords}
      />

      {/* Delete Confirm */}
      <AlertDialog open={Boolean(deleteId)} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The record and its variants will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
