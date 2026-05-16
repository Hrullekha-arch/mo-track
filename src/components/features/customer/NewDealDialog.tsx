"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { User, Deal, Customer } from "@/lib/types";
import { addDealAction } from "@/app/dashboard/customers/actions";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { getDealData } from "@/app/dashboard/customers/[customerId]/actions";

// ================= UTILITIES =================
const resolveDefaultBillingValues = (customer?: Customer | null) => {
  const normalizedHistory = Array.isArray((customer as any)?.billingDetails)
    ? (customer as any).billingDetails
        .map((entry: any) => ({
          billingName: String(entry?.billingName || "").trim(),
          billingPhone: String(entry?.billingPhone || "").trim(),
          billingAddress: String(entry?.billingAddress || "").trim(),
          gstin: String(entry?.gstin || "").trim().toUpperCase(),
          isDefault: entry?.isDefault === true,
        }))
        .filter(
          (entry: any) =>
            entry.billingName ||
            entry.billingPhone ||
            entry.billingAddress ||
            entry.gstin
        )
    : [];

  const preferred =
    normalizedHistory.find((entry: any) => entry.isDefault) ||
    normalizedHistory[0];

  return {
    billingName: preferred?.billingName || customer?.name || "",
    billingPhone:
      preferred?.billingPhone ||
      customer?.phone ||
      customer?.mobileNo ||
      "",
    billingAddress:
      preferred?.billingAddress ||
      customer?.billingAddress?.line1 ||
      customer?.addressPinCode ||
      "",
    billingGstin: preferred?.gstin || customer?.gstin || "",
  };
};

// ================= PROPS =================
interface NewDealDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newDeal: Deal) => void;
  customerId: string;
  customer?: Customer | null;
  salesmen: User[];
  dealId?: string | null;
}

// ================= COMPONENT =================
export function NewDealDialog({
  isOpen,
  onClose,
  onSuccess,
  customerId,
  customer,
  salesmen,
  dealId,
}: NewDealDialogProps) {
  const { toast } = useToast();

  // ================= STATE =================
  const [loading, setLoading] = React.useState(false);
  const [dealLoading, setDealLoading] = React.useState(false);
  const [crmUserId, setCrmUserId] = React.useState("");
  const [crmUserName, setCrmUserName] = React.useState("");
  const [crmLoading, setCrmLoading] = React.useState(false);

  // Form fields
  const [dealName, setDealName] = React.useState("");
  const [dealAmount, setDealAmount] = React.useState("");
  const [representativeId, setRepresentativeId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [measurementRequired, setMeasurementRequired] = React.useState("");
  const [advanceForMeasurement, setAdvanceForMeasurement] = React.useState("");
  const [useDifferentBillingDetails, setUseDifferentBillingDetails] =
    React.useState(false);
  const [billingName, setBillingName] = React.useState("");
  const [billingPhone, setBillingPhone] = React.useState("");
  const [billingAddress, setBillingAddress] = React.useState("");
  const [billingGstin, setBillingGstin] = React.useState("");

  // Errors
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // ================= RESET FORM =================
  const resetForm = React.useCallback(() => {
    const defaults = resolveDefaultBillingValues(customer);
    
    setDealName("");
    setDealAmount("");
    setRepresentativeId("");
    setDescription("");
    setMeasurementRequired("");
    setAdvanceForMeasurement("");
    setUseDifferentBillingDetails(false);
    setBillingName(defaults.billingName);
    setBillingPhone(defaults.billingPhone);
    setBillingAddress(defaults.billingAddress);
    setBillingGstin(defaults.billingGstin);
    setErrors({});
    setCrmUserId("");
    setCrmUserName("");
  }, [customer]);

  // ================= FETCH DEAL DATA (EDIT MODE) =================
  React.useEffect(() => {
    if (!dealId || !isOpen) return;

    let mounted = true;

    async function fetchDealData() {
      setDealLoading(true);
      try {
        const dealData = await getDealData(dealId!);

        if (!dealData) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Deal data not found.",
          });
          return;
        }

        if (!mounted) return;

        // Populate all fields
        setDealName(dealData.dealName || dealData.title || "");
        setDealAmount(
          String(dealData.dealAmount || dealData.expectedValue || "")
        );
        setRepresentativeId(
          dealData.representativeId || dealData.assignedSalesPerson?.id || ""
        );
        setDescription(dealData.description || "");
        setMeasurementRequired(
          (dealData.measurementRequired as string) || "No"
        );
        setAdvanceForMeasurement(
          (dealData.advanceForMeasurement as string) || "No"
        );

        // Billing details
        const hasBillingDetails = Boolean(
          dealData.billingDetails ||
            (dealData as any).billingName ||
            (dealData as any).useDifferentBillingDetails
        );
        setUseDifferentBillingDetails(hasBillingDetails);

        if (hasBillingDetails) {
          setBillingName(
            dealData.billingDetails?.billingName ||
              (dealData as any).billingName ||
              ""
          );
          setBillingPhone(
            dealData.billingDetails?.billingPhone ||
              (dealData as any).billingPhone ||
              ""
          );
          setBillingAddress(
            dealData.billingDetails?.billingAddress ||
              (dealData as any).billingAddress ||
              ""
          );
          setBillingGstin(
            dealData.billingDetails?.gstin ||
              (dealData as any).billingGstin ||
              ""
          );
        }

        console.log("✅ Deal data loaded successfully");
      } catch (error) {
        console.error("Error fetching deal data:", error);
        if (mounted) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to fetch deal data.",
          });
        }
      } finally {
        if (mounted) {
          setDealLoading(false);
        }
      }
    }

    fetchDealData();

    return () => {
      mounted = false;
    };
  }, [dealId, isOpen, toast]);

  // ================= RESET ON OPEN (NEW MODE) =================
  React.useEffect(() => {
    if (!isOpen || dealId) return;
    resetForm();
  }, [isOpen, dealId, resetForm]);

  // ================= RESOLVE CRM HANDLER =================
  React.useEffect(() => {
    const resolveCrm = async () => {
      if (!representativeId) {
        setCrmUserId("");
        setCrmUserName("");
        return;
      }

      const salesmanUser = salesmen.find((s) => s.id === representativeId);
      if (!salesmanUser) {
        setCrmUserId("");
        setCrmUserName("Unassigned");
        return;
      }

      setCrmLoading(true);
      try {
        const assignmentRef = doc(
          db,
          "salesmanCrmAssignments",
          salesmanUser.name
        );
        const assignmentSnap = await getDoc(assignmentRef);
        const assignedCrmId = assignmentSnap.exists()
          ? assignmentSnap.data().crmUserId
          : "";

        if (!assignedCrmId) {
          setCrmUserId("");
          setCrmUserName("Unassigned");
          return;
        }

        const crmSnap = await getDoc(doc(db, "users", assignedCrmId));
        const crmName = crmSnap.exists()
          ? crmSnap.data()?.name || "Unknown"
          : "Unknown";

        setCrmUserId(assignedCrmId);
        setCrmUserName(crmName);
      } catch (error) {
        console.error("Failed to resolve CRM handler:", error);
        setCrmUserId("");
        setCrmUserName("Unassigned");
      } finally {
        setCrmLoading(false);
      }
    };

    resolveCrm();
  }, [representativeId, salesmen]);

  // ================= VALIDATION =================
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!dealName.trim()) {
      newErrors.dealName = "Deal name is required.";
    }

    if (!representativeId) {
      newErrors.representativeId = "Representative must be selected.";
    }

    if (!measurementRequired) {
      newErrors.measurementRequired = "This field is required.";
    }

    if (!advanceForMeasurement) {
      newErrors.advanceForMeasurement = "This field is required.";
    }

    if (dealAmount && Number(dealAmount) <= 0) {
      newErrors.dealAmount = "Deal amount must be positive.";
    }

    if (useDifferentBillingDetails) {
      if (!billingName.trim()) {
        newErrors.billingName = "Billing name is required.";
      }
      if (!billingPhone.trim()) {
        newErrors.billingPhone = "Billing phone is required.";
      }
      if (!billingAddress.trim()) {
        newErrors.billingAddress = "Billing address is required.";
      }
      if (!billingGstin.trim()) {
        newErrors.billingGstin = "Billing GST is required.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ================= SUBMIT =================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please fill in all required fields.",
      });
      return;
    }

    setLoading(true);
    try {
      const result = await addDealAction({
        customerId,
        title: dealName,
        expectedValue: Number(dealAmount) || 0,
        assignedSalesPerson: representativeId
          ? {
              id: representativeId,
              name:
                salesmen.find((s) => s.id === representativeId)?.name || "",
            }
          : undefined,
        handleByCmr: crmUserId
          ? { id: crmUserId, name: crmUserName }
          : undefined,
        dealName,
        dealAmount: Number(dealAmount) || 0,
        representativeId,
        description: description.trim(),
        measurementRequired: measurementRequired as "Yes" | "No",
        advanceForMeasurement: advanceForMeasurement as
          | "Yes"
          | "No"
          | "Old",
        billingDetails: useDifferentBillingDetails
          ? {
              billingName: billingName.trim(),
              billingPhone: billingPhone.trim(),
              billingAddress: billingAddress.trim(),
              gstin: billingGstin.trim().toUpperCase(),
              isDefault: true,
            }
          : undefined,
      });

      if (result.success && result.deal) {
        onSuccess(result.deal);
        resetForm();
        toast({
          title: "Success",
          description: dealId
            ? "Deal updated successfully."
            : "Deal created successfully.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message,
        });
      }
    } catch (error: any) {
      console.error("Error saving deal:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Could not save the deal.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dealId ? "Edit Deal" : "New Deal"}</DialogTitle>
        </DialogHeader>

        {dealLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">
              Loading deal data...
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {/* Deal Name */}
            <div className="space-y-2">
              <Label htmlFor="dealName">
                Deal Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="dealName"
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                placeholder="Enter deal name"
              />
              {errors.dealName && (
                <p className="text-sm text-destructive">{errors.dealName}</p>
              )}
            </div>

            {/* Deal Amount */}
            <div className="space-y-2">
              <Label htmlFor="dealAmount">Deal Amount</Label>
              <Input
                id="dealAmount"
                type="number"
                value={dealAmount}
                onChange={(e) => setDealAmount(e.target.value)}
                placeholder="0.00"
              />
              {errors.dealAmount && (
                <p className="text-sm text-destructive">{errors.dealAmount}</p>
              )}
            </div>

            {/* Representative */}
            <div className="space-y-2">
              <Label htmlFor="representativeId">
                Representative <span className="text-destructive">*</span>
              </Label>
              <Select
                value={representativeId}
                onValueChange={setRepresentativeId}
              >
                <SelectTrigger id="representativeId">
                  <SelectValue placeholder="--SELECT--" />
                </SelectTrigger>
                <SelectContent>
                  {salesmen.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.representativeId && (
                <p className="text-sm text-destructive">
                  {errors.representativeId}
                </p>
              )}
            </div>

            {/* CRM Handler */}
            <div className="space-y-2">
              <Label>CRM Handler</Label>
              <Input
                value={crmLoading ? "Loading..." : crmUserName || "Unassigned"}
                disabled
              />
            </div>

            {/* Measurement Required */}
            <div className="space-y-2">
              <Label htmlFor="measurementRequired">
                Measurement Required <span className="text-destructive">*</span>
              </Label>
              <Select
                value={measurementRequired}
                onValueChange={setMeasurementRequired}
              >
                <SelectTrigger id="measurementRequired">
                  <SelectValue placeholder="--SELECT--" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                </SelectContent>
              </Select>
              {errors.measurementRequired && (
                <p className="text-sm text-destructive">
                  {errors.measurementRequired}
                </p>
              )}
            </div>

            {/* Advance for Measurement */}
            <div className="space-y-2">
              <Label htmlFor="advanceForMeasurement">
                Receive Advance for measurement{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Select
                value={advanceForMeasurement}
                onValueChange={setAdvanceForMeasurement}
              >
                <SelectTrigger id="advanceForMeasurement">
                  <SelectValue placeholder="--SELECT--" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Old">Old</SelectItem>
                </SelectContent>
              </Select>
              {errors.advanceForMeasurement && (
                <p className="text-sm text-destructive">
                  {errors.advanceForMeasurement}
                </p>
              )}
            </div>

            {/* Different Billing Details */}
            <div className="rounded-md border p-3">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="useDifferentBillingDetails"
                  checked={useDifferentBillingDetails}
                  onCheckedChange={(checked) =>
                    setUseDifferentBillingDetails(Boolean(checked))
                  }
                />
                <Label htmlFor="useDifferentBillingDetails" className="m-0">
                  Different Billing Details
                </Label>
              </div>
            </div>

            {/* Billing Details Fields */}
            {useDifferentBillingDetails && (
              <div className="grid grid-cols-1 gap-3 rounded-md border border-muted p-3">
                <div className="space-y-2">
                  <Label htmlFor="billingName">
                    Billing Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="billingName"
                    value={billingName}
                    onChange={(e) => setBillingName(e.target.value)}
                    placeholder="Company / billing name"
                  />
                  {errors.billingName && (
                    <p className="text-sm text-destructive">
                      {errors.billingName}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingPhone">
                    Billing Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="billingPhone"
                    value={billingPhone}
                    onChange={(e) => setBillingPhone(e.target.value)}
                    placeholder="Billing contact number"
                  />
                  {errors.billingPhone && (
                    <p className="text-sm text-destructive">
                      {errors.billingPhone}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingAddress">
                    Billing Address <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="billingAddress"
                    rows={3}
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    placeholder="Billing address"
                  />
                  {errors.billingAddress && (
                    <p className="text-sm text-destructive">
                      {errors.billingAddress}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingGstin">
                    Billing GST <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="billingGstin"
                    value={billingGstin}
                    onChange={(e) => setBillingGstin(e.target.value)}
                    placeholder="GSTIN"
                  />
                  {errors.billingGstin && (
                    <p className="text-sm text-destructive">
                      {errors.billingGstin}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">
                Deal Description{" "}
                <span className="text-sm text-muted-foreground">
                  (Up to 2000 characters)
                </span>
              </Label>
              <Textarea
                id="description"
                rows={4}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || dealLoading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {dealId ? "Update" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}