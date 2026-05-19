import type { User } from "@/lib/types";
import type { HrEmployee } from "../types";

export type OnboardingFieldSection =
  | "Basic Profile"
  | "Employee Details"
  | "Working Details"
  | "KYC & Bank";

export type OnboardingFieldKey =
  | "name"
  | "email"
  | "phone"
  | "role"
  | "store"
  | "employeeCode"
  | "department"
  | "designation"
  | "reportingManager"
  | "timesheetDutyStart"
  | "timesheetDutyEnd"
  | "joiningDate"
  | "panNumber"
  | "aadhaarNumber"
  | "uanNumber"
  | "esiNumber"
  | "bankName"
  | "bankAccountNumber"
  | "bankIfsc";

export type OnboardingFieldMeta = {
  key: OnboardingFieldKey;
  label: string;
  section: OnboardingFieldSection;
  autoManaged?: boolean;
  inputType?: "text" | "email" | "tel" | "date" | "time";
  placeholder?: string;
};

export const ONBOARDING_REQUIRED_FIELDS: OnboardingFieldMeta[] = [
  { key: "name", label: "Name", section: "Basic Profile", inputType: "text", placeholder: "Full name" },
  { key: "email", label: "Email", section: "Basic Profile", inputType: "email", placeholder: "name@company.com" },
  { key: "phone", label: "Phone", section: "Basic Profile", inputType: "tel", placeholder: "10-digit mobile number" },
  { key: "role", label: "Role", section: "Basic Profile", autoManaged: true },
  { key: "store", label: "Store", section: "Basic Profile", autoManaged: true },

  { key: "employeeCode", label: "Employee Code", section: "Employee Details", inputType: "text", placeholder: "Employee / biometric code" },
  { key: "department", label: "Department", section: "Employee Details", inputType: "text", placeholder: "Department name" },
  { key: "designation", label: "Designation", section: "Employee Details", inputType: "text", placeholder: "Job title" },
  { key: "reportingManager", label: "Reporting Manager", section: "Employee Details", inputType: "text", placeholder: "Manager name" },

  { key: "timesheetDutyStart", label: "Working Time From", section: "Working Details", inputType: "time" },
  { key: "timesheetDutyEnd", label: "Working Time To", section: "Working Details", inputType: "time" },
  { key: "joiningDate", label: "Joining Date", section: "Working Details", inputType: "date" },

  { key: "panNumber", label: "PAN", section: "KYC & Bank", inputType: "text", placeholder: "PAN number" },
  { key: "aadhaarNumber", label: "Aadhaar", section: "KYC & Bank", inputType: "text", placeholder: "Aadhaar number" },
  { key: "uanNumber", label: "UAN", section: "KYC & Bank", inputType: "text", placeholder: "UAN number" },
  { key: "esiNumber", label: "ESI", section: "KYC & Bank", inputType: "text", placeholder: "ESI number" },
  { key: "bankName", label: "Bank Name", section: "KYC & Bank", inputType: "text", placeholder: "Bank name" },
  { key: "bankAccountNumber", label: "Account Number", section: "KYC & Bank", inputType: "text", placeholder: "Account number" },
  { key: "bankIfsc", label: "IFSC", section: "KYC & Bank", inputType: "text", placeholder: "IFSC code" },
];

export type EditableOnboardingFieldKey = Exclude<OnboardingFieldKey, "role" | "store">;

export const EDITABLE_ONBOARDING_FIELDS = ONBOARDING_REQUIRED_FIELDS.filter(
  (field): field is OnboardingFieldMeta & { key: EditableOnboardingFieldKey } => !field.autoManaged
);

export type OnboardingProfileLike = Partial<
  Pick<
    User,
    | "name"
    | "email"
    | "role"
    | "store"
    | "employeeCode"
    | "department"
    | "reportingManager"
    | "joiningDate"
    | "timesheetDutyStart"
    | "timesheetDutyEnd"
    | "panNumber"
    | "aadhaarNumber"
    | "bankName"
    | "bankAccountNumber"
    | "bankIfsc"
    | "uanNumber"
    | "esiNumber"
  >
> &
  Partial<
    Pick<
      HrEmployee,
      "phone" | "designation"
    >
  >;

const readFieldValue = (profile: OnboardingProfileLike, key: OnboardingFieldKey) => {
  switch (key) {
    case "name":
      return profile.name;
    case "email":
      return profile.email;
    case "phone":
      return profile.phone;
    case "role":
      return profile.role;
    case "store":
      return profile.store;
    case "employeeCode":
      return profile.employeeCode;
    case "department":
      return profile.department;
    case "designation":
      return profile.designation;
    case "reportingManager":
      return profile.reportingManager;
    case "timesheetDutyStart":
      return profile.timesheetDutyStart;
    case "timesheetDutyEnd":
      return profile.timesheetDutyEnd;
    case "joiningDate":
      return profile.joiningDate;
    case "panNumber":
      return profile.panNumber;
    case "aadhaarNumber":
      return profile.aadhaarNumber;
    case "uanNumber":
      return profile.uanNumber;
    case "esiNumber":
      return profile.esiNumber;
    case "bankName":
      return profile.bankName;
    case "bankAccountNumber":
      return profile.bankAccountNumber;
    case "bankIfsc":
      return profile.bankIfsc;
    default:
      return "";
  }
};

const hasFieldValue = (value: unknown) => String(value ?? "").trim().length > 0;

export const getMissingOnboardingFields = (
  profile: OnboardingProfileLike,
  options?: { includeAutoManaged?: boolean }
) => {
  const includeAutoManaged = options?.includeAutoManaged ?? true;
  return ONBOARDING_REQUIRED_FIELDS.filter((field) => {
    if (!includeAutoManaged && field.autoManaged) {
      return false;
    }
    return !hasFieldValue(readFieldValue(profile, field.key));
  });
};

export const getOnboardingProgress = (
  profile: OnboardingProfileLike,
  options?: { includeAutoManaged?: boolean }
) => {
  const includeAutoManaged = options?.includeAutoManaged ?? true;
  const fields = includeAutoManaged
    ? ONBOARDING_REQUIRED_FIELDS
    : EDITABLE_ONBOARDING_FIELDS;
  const missing = getMissingOnboardingFields(profile, { includeAutoManaged });
  const total = fields.length;
  const completed = total - missing.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent, missing };
};

export const createEditableOnboardingFormState = (
  profile: OnboardingProfileLike
): Record<EditableOnboardingFieldKey, string> =>
  EDITABLE_ONBOARDING_FIELDS.reduce(
    (acc, field) => {
      acc[field.key] = String(readFieldValue(profile, field.key) ?? "").trim();
      return acc;
    },
    {} as Record<EditableOnboardingFieldKey, string>
  );

export const HR_ONBOARDING_CONFIG_COLLECTION = "hrOnboardingConfig";
export const HR_ONBOARDING_CONFIG_DOC_ID = "settings";
export const HR_ONBOARDING_POPUP_FIELD = "popupEnabled";
