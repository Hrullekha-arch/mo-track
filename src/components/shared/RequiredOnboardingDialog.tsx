"use client";

import * as React from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createEditableOnboardingFormState,
  EDITABLE_ONBOARDING_FIELDS,
  getMissingOnboardingFields,
  HR_ONBOARDING_CONFIG_COLLECTION,
  HR_ONBOARDING_CONFIG_DOC_ID,
  HR_ONBOARDING_POPUP_FIELD,
} from "@/app/dashboard/hr/utils/onboarding-utils";
import type {
  EditableOnboardingFieldKey,
  OnboardingFieldSection,
} from "@/app/dashboard/hr/utils/onboarding-utils";

const groupedEditableFields = EDITABLE_ONBOARDING_FIELDS.reduce(
  (acc, field) => {
    if (!acc[field.section]) {
      acc[field.section] = [];
    }
    acc[field.section].push(field);
    return acc;
  },
  {} as Record<OnboardingFieldSection, typeof EDITABLE_ONBOARDING_FIELDS>
);

const sectionOrder: OnboardingFieldSection[] = [
  "Basic Profile",
  "Employee Details",
  "Working Details",
  "KYC & Bank",
];

const trimFormValues = (form: Record<EditableOnboardingFieldKey, string>) =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, String(value || "").trim()])
  ) as Record<EditableOnboardingFieldKey, string>;

export function RequiredOnboardingDialog() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [popupEnabled, setPopupEnabled] = React.useState(false);
  const [configLoading, setConfigLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<Record<EditableOnboardingFieldKey, string>>(() =>
    createEditableOnboardingFormState({})
  );

  React.useEffect(() => {
    setForm(createEditableOnboardingFormState(user || {}));
  }, [user?.id]);

  React.useEffect(() => {
    if (!user) {
      setPopupEnabled(false);
      setConfigLoading(false);
      return;
    }

    setConfigLoading(true);
    const configRef = doc(db, HR_ONBOARDING_CONFIG_COLLECTION, HR_ONBOARDING_CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(
      configRef,
      (snapshot) => {
        setPopupEnabled(Boolean(snapshot.data()?.[HR_ONBOARDING_POPUP_FIELD]));
        setConfigLoading(false);
      },
      () => {
        setConfigLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.id]);

  const validationProfile = React.useMemo(
    () => ({ ...(user || {}), ...form }),
    [user, form]
  );

  const missingEditableFields = React.useMemo(
    () => getMissingOnboardingFields(validationProfile, { includeAutoManaged: false }),
    [validationProfile]
  );

  const missingAutoManagedFields = React.useMemo(
    () => getMissingOnboardingFields(validationProfile, { includeAutoManaged: true }).filter((field) => field.autoManaged),
    [validationProfile]
  );

  React.useEffect(() => {
    const shouldOpen = Boolean(user && popupEnabled && !configLoading && missingEditableFields.length > 0);
    setOpen(shouldOpen);
  }, [user, popupEnabled, configLoading, missingEditableFields.length]);

  const updateField = (key: EditableOnboardingFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveProfile = async () => {
    if (!user) return;

    const normalizedForm = trimFormValues(form);
    setForm(normalizedForm);

    const missingBeforeSave = getMissingOnboardingFields(
      { ...user, ...normalizedForm },
      { includeAutoManaged: false }
    );

    if (missingBeforeSave.length > 0) {
      toast({
        variant: "destructive",
        title: "Required details are still missing",
        description: `Please fill ${missingBeforeSave.length} remaining field${missingBeforeSave.length > 1 ? "s" : ""}.`,
      });
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", user.id),
        {
          ...normalizedForm,
          onboardingProfileLastUpdatedAt: new Date().toISOString(),
          onboardingProfileLastUpdatedBy: user.id,
        },
        { merge: true }
      );

      toast({
        title: "Onboarding details saved",
        description: "Your required profile details are now complete.",
      });

      setOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Unable to save onboarding details",
        description: error?.message || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!user || !popupEnabled || configLoading) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) setOpen(nextOpen); }}>
      <DialogContent
        className="max-h-[88vh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <DialogTitle>Complete Your Onboarding Profile</DialogTitle>
          </div>
          <DialogDescription>
            HR has enabled mandatory onboarding checks. Fill all required details to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Role (Auto Detected)</Label>
              <Input value={String(user.role || "")} readOnly disabled />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-500">Store (Auto Detected)</Label>
              <Input value={String(user.store || "")} readOnly disabled />
            </div>
          </div>

          {missingAutoManagedFields.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Auto-managed details missing: {missingAutoManagedFields.map((field) => field.label).join(", ")}. Contact HR.
            </div>
          ) : null}

          {sectionOrder.map((section) => {
            const fields = groupedEditableFields[section] || [];
            return (
              <div key={section} className="rounded-lg border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">{section}</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-xs text-slate-600">{field.label}</Label>
                      <Input
                        type={field.inputType || "text"}
                        value={form[field.key] || ""}
                        placeholder={field.placeholder}
                        onChange={(event) => updateField(field.key, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <span className="text-slate-600">Remaining required fields</span>
            <Badge variant="outline" className={missingEditableFields.length ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
              {missingEditableFields.length}
            </Badge>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => void saveProfile()} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Required Details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
