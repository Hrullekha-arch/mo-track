"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Search,
  Upload,
  User2,
  X,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createComplaintCompanyVisitAction,
  searchCustomersForComplaintAction,
  uploadComplaintPhotoAction,
  type ComplaintCustomerSearchResult,
} from "@/app/dashboard/visits/actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const complaintTypeOptions = [
  "Curtain Alteration",
  "Curtain Uninstallation",
  "Curtain Reinstallation",
  "Curtain Stitching Issue",
  "Blind Repair",
  "Blind Uninstallation",
  "Track/Channel Issue",
  "Motor/Remote Issue",
  "Measurement Issue",
  "Installation Issue",
  "Fabric Damage",
  "Hardware Replacement",
  "Other",
];

const toDateInputValue = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const [, payload] = raw.split(",");
      resolve(payload || raw);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const fileToPreviewUrl = (file: File): string => URL.createObjectURL(file);

const sanitizeCustomerForAction = (customer: ComplaintCustomerSearchResult): ComplaintCustomerSearchResult =>
  Object.fromEntries(
    Object.entries({
      id: String(customer.id || "").trim(),
      name: String(customer.name || "").trim(),
      phone: String(customer.phone || "").trim() || undefined,
      mobileNo: String(customer.mobileNo || "").trim() || undefined,
      email: String(customer.email || "").trim() || undefined,
      address: String(customer.address || "").trim() || undefined,
      billingAddress: String(customer.billingAddress || "").trim() || undefined,
      pincode: String(customer.pincode || "").trim() || undefined,
      customerCode: String(customer.customerCode || "").trim() || undefined,
      source: customer.source,
    }).filter(([, value]) => value !== undefined)
  ) as ComplaintCustomerSearchResult;

/* ── Step indicator ── */
function StepIndicator({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3 select-none">
      {[1, 2].map((s) => {
        const done = s < current;
        const active = s === current;
        return (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200"
                style={{
                  background: done
                    ? "#10b981"
                    : active
                    ? "#6366f1"
                    : "#e2e8f0",
                  color: done || active ? "#fff" : "#94a3b8",
                }}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span
                className="text-xs font-semibold hidden sm:block"
                style={{ color: active ? "#6366f1" : done ? "#10b981" : "#94a3b8" }}
              >
                {s === 1 ? "Find Customer" : "Complaint Details"}
              </span>
            </div>
            {s < 2 && (
              <div
                className="flex-1 h-px min-w-[24px] transition-all duration-300"
                style={{ background: current > 1 ? "#10b981" : "#e2e8f0" }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Photo preview tile ── */
function PhotoTile({
  file,
  index,
  onRemove,
}: {
  file: File;
  index: number;
  onRemove: () => void;
}) {
  const [url, setUrl] = React.useState("");
  React.useEffect(() => {
    const objectUrl = fileToPreviewUrl(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
      {url && (
        <img src={url} alt={file.name} className="h-full w-full object-cover" />
      )}
      {/* overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1.5 right-1.5 rounded-full bg-white/90 hover:bg-white p-0.5 shadow opacity-0 group-hover:opacity-100 transition"
        title="Remove photo"
      >
        <X className="h-3.5 w-3.5 text-slate-700" />
      </button>
      <div className="absolute bottom-1 left-1.5 text-[10px] font-mono text-white/80 bg-black/40 rounded px-1 leading-4">
        {index + 1}
      </div>
      {/* size label */}
      <div className="absolute bottom-1 right-1.5 text-[9px] text-white/70 bg-black/40 rounded px-1 leading-4 hidden group-hover:block">
        {(file.size / 1024 / 1024).toFixed(1)}MB
      </div>
    </div>
  );
}

/* ── Add photo tile ── */
function AddPhotoTile({ disabled, onChange }: { disabled: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label
      className={[
        "flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed transition cursor-pointer",
        disabled
          ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
          : "border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40",
      ].join(" ")}
    >
      <ImagePlus className="h-5 w-5 text-slate-400 mb-1" />
      <span className="text-[10px] text-slate-400 font-medium">Add photo</span>
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={onChange}
      />
    </label>
  );
}

/* ── Customer card ── */
function CustomerCard({
  customer,
  onSelect,
}: {
  customer: ComplaintCustomerSearchResult;
  onSelect: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shadow-sm hover:border-indigo-200 hover:shadow transition duration-150">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
          <User2 className="h-5 w-5 text-indigo-400" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{customer.name}</p>
          <p className="text-xs text-slate-500 truncate">
            {customer.phone || customer.mobileNo || "—"}
            {customer.email ? ` · ${customer.email}` : ""}
          </p>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            {customer.address || customer.billingAddress || "No address on file"}
          </p>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onSelect}
        className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex-shrink-0 shadow-sm"
      >
        Select
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ── Main component ── */
export default function RegisterComplaintDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [step, setStep] = React.useState<1 | 2>(1);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<ComplaintCustomerSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState<ComplaintCustomerSearchResult | null>(null);
  const [searchError, setSearchError] = React.useState("");

  const [complaintType, setComplaintType] = React.useState("");
  const [visitDate, setVisitDate] = React.useState(toDateInputValue());
  const [customerAddress, setCustomerAddress] = React.useState("");
  const [workNote, setWorkNote] = React.useState("");
  const [photos, setPhotos] = React.useState<File[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const resetState = React.useCallback(() => {
    setStep(1);
    setSearchTerm("");
    setSearching(false);
    setSearchResults([]);
    setSelectedCustomer(null);
    setSearchError("");
    setComplaintType("");
    setVisitDate(toDateInputValue());
    setCustomerAddress("");
    setWorkNote("");
    setPhotos([]);
    setSubmitting(false);
  }, []);

  React.useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const handleSearchCustomer = async () => {
    const q = searchTerm.trim();
    if (!q) {
      setSearchError("Please enter a name, email or mobile number.");
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    setSelectedCustomer(null);
    try {
      const result = await searchCustomersForComplaintAction(q);
      if (!result.success) {
        setSearchError(result.message || "Customer search failed.");
        return;
      }
      if (!result.customers.length) {
        setSearchError("No customer found. Not able to provide service.");
        return;
      }
      setSearchResults(result.customers);
    } catch {
      setSearchError("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCustomer = (customer: ComplaintCustomerSearchResult) => {
    setSelectedCustomer(customer);
    setCustomerAddress(customer.address || customer.billingAddress || "");
    setStep(2);
  };

  const handlePhotoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []).filter((f) =>
      f.type.toLowerCase().startsWith("image/")
    );
    if (!incoming.length) return;
    const merged = [...photos, ...incoming];
    if (merged.length > 5) {
      toast({ variant: "destructive", title: "Maximum 5 photos allowed" });
    }
    setPhotos(merged.slice(0, 5));
    e.target.value = "";
  };

  const handleSubmitComplaint = async () => {
    if (!selectedCustomer) { setStep(1); return; }
    if (!complaintType) { toast({ variant: "destructive", title: "Complaint type is required" }); return; }
    if (!visitDate) { toast({ variant: "destructive", title: "Visit date is required" }); return; }
    if (!customerAddress.trim()) { toast({ variant: "destructive", title: "Address is required" }); return; }
    if (!workNote.trim()) { toast({ variant: "destructive", title: "Work note is required" }); return; }
    if (!photos.length) {
      toast({ variant: "destructive", title: "At least 1 photo is required" });
      return;
    }

    setSubmitting(true);
    try {
      const folder = `companyVisits/complaints/${String(selectedCustomer.id || "customer").replace(/[^\w-]/g, "_")}`;
      const uploadedUrls: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const base64 = await fileToBase64(file);
        const uploadResult = await uploadComplaintPhotoAction({
          fileName: `complaint-${Date.now()}-${i + 1}-${file.name}`,
          mimeType: file.type || "image/jpeg",
          base64Data: base64,
          folder,
        });
        if (!uploadResult.success || !uploadResult.url) {
          toast({
            variant: "destructive",
            title: "Failed to upload complaint photo",
            description: uploadResult.message,
          });
          return;
        }
        uploadedUrls.push(uploadResult.url);
      }
      const result = await createComplaintCompanyVisitAction({
        customer: sanitizeCustomerForAction(selectedCustomer),
        complaintType,
        visitDate,
        customerAddress: customerAddress.trim(),
        workNote: workNote.trim(),
        photoUrls: uploadedUrls,
        createdBy: { id: user?.id, name: user?.name, email: user?.email },
      });
      if (!result.success) {
        toast({ variant: "destructive", title: "Failed to register complaint", description: result.message });
        return;
      }
      toast({ title: "Complaint registered ✓", description: "Saved with Pending Approval status." });
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Failed to register complaint", description: error?.message || "Something went wrong." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[94vh] overflow-hidden flex flex-col gap-0 p-0 rounded-2xl border-slate-200 shadow-xl">

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">
              Register Complaint
            </DialogTitle>
          </DialogHeader>
          <StepIndicator current={step} />
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Search box */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Search Customer
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Name, email or mobile number…"
                      className="pl-9 rounded-xl border-slate-200 focus-visible:ring-indigo-400"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); void handleSearchCustomer(); }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => void handleSearchCustomer()}
                    disabled={searching}
                    className="rounded-xl bg-indigo-600 hover:bg-indigo-700 px-5 shadow-sm"
                  >
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                  </Button>
                </div>
              </div>

              {/* Error */}
              {searchError && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {/* Results */}
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} found
                  </p>
                  <div className="space-y-2">
                    {searchResults.map((c) => (
                      <CustomerCard key={c.id} customer={c} onSelect={() => handleSelectCustomer(c)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!searching && !searchError && searchResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-3">
                  <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <Search className="h-6 w-6 opacity-50" />
                  </div>
                  <p className="text-sm text-center leading-relaxed">
                    Search by customer name, mobile,<br />or email address to get started.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && selectedCustomer && (
            <div className="space-y-5">
              {/* Selected customer banner */}
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-800 truncate">{selectedCustomer.name}</p>
                  <p className="text-xs text-emerald-600 truncate">
                    {selectedCustomer.phone || selectedCustomer.mobileNo || ""}
                    {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 font-semibold flex-shrink-0 hover:underline"
                >
                  Change
                </button>
              </div>

              {/* Type + Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Complaint Type <span className="text-rose-400">*</span>
                  </Label>
                  <Select value={complaintType} onValueChange={setComplaintType}>
                    <SelectTrigger className="rounded-xl border-slate-200 focus:ring-indigo-400">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {complaintTypeOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Visit Date <span className="text-rose-400">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="rounded-xl border-slate-200 focus-visible:ring-indigo-400"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Customer Address <span className="text-rose-400">*</span>
                </Label>
                <Textarea
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Enter or confirm customer address…"
                  className="min-h-[76px] rounded-xl border-slate-200 focus-visible:ring-indigo-400 resize-none text-sm"
                />
              </div>

              {/* Work note */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Work Note <span className="text-rose-400">*</span>
                </Label>
                <Textarea
                  value={workNote}
                  onChange={(e) => setWorkNote(e.target.value)}
                  placeholder="Describe the complaint and work performed…"
                  className="min-h-[96px] rounded-xl border-slate-200 focus-visible:ring-indigo-400 resize-none text-sm"
                />
              </div>

              {/* Photos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Photos <span className="text-rose-400">*</span>
                    <span className="ml-1 text-slate-400 normal-case font-normal">(min 1, max 5)</span>
                  </Label>
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: photos.length >= 5 ? "#fee2e2" : "#f1f5f9",
                      color: photos.length >= 5 ? "#b91c1c" : "#64748b",
                    }}
                  >
                    {photos.length}/5
                  </span>
                </div>

                {/* Grid: thumbnails + add tile */}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))" }}
                >
                  {photos.map((file, i) => (
                    <PhotoTile
                      key={`${file.name}-${i}`}
                      file={file}
                      index={i}
                      onRemove={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    />
                  ))}
                  {photos.length < 5 && (
                    <AddPhotoTile disabled={submitting} onChange={handlePhotoInputChange} />
                  )}
                </div>

                {photos.length === 0 && (
                  <p className="text-xs text-rose-500">At least one photo is required.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
          {step === 2 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="rounded-xl border-slate-200 text-slate-600 hover:bg-white"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="rounded-xl border-slate-200 text-slate-600 hover:bg-white"
            >
              Cancel
            </Button>
            {step === 2 && (
              <Button
                type="button"
                onClick={() => void handleSubmitComplaint()}
                disabled={submitting}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-sm px-5"
              >
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" />Register Complaint</>
                )}
              </Button>
            )}
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
