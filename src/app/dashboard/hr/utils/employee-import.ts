import * as XLSX from "xlsx";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Column definitions ───────────────────────────────────────────────────────

type ColDef = { header: string; hint: string; example: string };

const COLS: ColDef[] = [
  { header: "Name",                    hint: "Required – full name",                        example: "Ravi Kumar" },
  { header: "Employee Code",           hint: "Used as Biometric ID too",                    example: "1082" },
  { header: "Phone",                   hint: "10-digit mobile",                             example: "9876543210" },
  { header: "Email",                   hint: "Work email (optional)",                       example: "ravi@company.com" },
  { header: "Role",                    hint: "employee / salesman / installer / CRM / PC / salesmanager", example: "employee" },
  { header: "Store",                   hint: "Branch / store name",                         example: "MO GCR BRANCH" },
  { header: "Department",              hint: "e.g. Operations, Sales",                      example: "Operations" },
  { header: "Designation",             hint: "e.g. Sr. Executive, Team Lead",               example: "Sr. Executive" },
  { header: "Reporting Manager",       hint: "Manager name (optional)",                     example: "Sunita Sharma" },
  { header: "Joining Date",            hint: "YYYY-MM-DD format",                           example: "2024-01-15" },
  { header: "Status",                  hint: "active / on_leave / inactive",                example: "active" },
  { header: "Basic Salary",            hint: "Monthly basic (number)",                      example: "15000" },
  { header: "HRA",                     hint: "Monthly HRA (number)",                        example: "7500" },
  { header: "Special Allowance",       hint: "Monthly special allowance (number)",          example: "5000" },
  { header: "Other Allowance",         hint: "Any other allowance (number)",                example: "0" },
  { header: "Has PF",                  hint: "YES or NO",                                   example: "YES" },
  { header: "PF Amount",               hint: "Monthly PF deduction (number)",               example: "1800" },
  { header: "Has Health Insurance",    hint: "YES or NO",                                   example: "NO" },
  { header: "ESI Amount",              hint: "Monthly ESI deduction (number)",              example: "0" },
  { header: "Professional Tax",        hint: "Monthly PT (number)",                         example: "200" },
  { header: "TDS",                     hint: "Monthly TDS (number)",                        example: "0" },
  { header: "Other Deduction Label",   hint: "Label for extra deduction",                   example: "Canteen" },
  { header: "Other Deduction Amount",  hint: "Monthly extra deduction (number)",            example: "500" },
  { header: "PAN",                     hint: "PAN card number",                             example: "ABCDE1234F" },
  { header: "Aadhaar",                 hint: "12-digit Aadhaar number",                     example: "1234 5678 9012" },
  { header: "UAN Number",              hint: "Universal Account Number (PF)",               example: "100123456789" },
  { header: "ESI Number",              hint: "ESI card number",                             example: "" },
  { header: "Bank Name",               hint: "Bank name",                                   example: "SBI" },
  { header: "Bank Account Number",     hint: "Account number",                              example: "1234567890" },
  { header: "Bank IFSC",               hint: "IFSC code",                                   example: "SBIN0001234" },
];

// ─── Template download ────────────────────────────────────────────────────────

export function downloadEmployeeTemplate() {
  const headerRow = COLS.map((c) => c.header);
  const hintRow   = COLS.map((c) => c.hint);
  const exampleRow = COLS.map((c) => c.example);

  const ws = XLSX.utils.aoa_to_sheet([headerRow, hintRow, exampleRow]);
  ws["!cols"] = COLS.map(() => ({ wch: 24 }));

  // Freeze top row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");

  // Instructions sheet
  const instrData = [
    ["EMPLOYEE IMPORT INSTRUCTIONS"],
    [""],
    ["1. Do NOT edit or remove the header row (row 1)."],
    ["2. Row 2 shows hints — you may delete it before uploading."],
    ["3. Row 3 is a sample row — replace with your data or delete."],
    ["4. Name is required for every row. Rows with empty Name are skipped."],
    ["5. Joining Date must be in YYYY-MM-DD format (e.g. 2024-01-15)."],
    ["6. Has PF / Has Health Insurance: enter YES or NO."],
    ["7. Salary fields are monthly amounts in rupees (numbers only, no ₹ symbol)."],
    ["8. Employee Code is also used as Biometric ID for attendance matching."],
    ["9. Role values: employee, salesman, installer, CRM, PC, salesmanager"],
    ["10. Status values: active, on_leave, inactive"],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
  wsInstr["!cols"] = [{ wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");

  XLSX.writeFile(wb, "employee-import-template.xlsx");
}

// ─── Parse uploaded file ──────────────────────────────────────────────────────

export type ImportRow = {
  rowNum: number;
  name: string;
  employeeCode?: string;
  phone?: string;
  email?: string;
  role?: string;
  store?: string;
  department?: string;
  designation?: string;
  reportingManager?: string;
  joiningDate?: string;
  employmentStatus?: string;
  salaryBasic?: number;
  salaryHra?: number;
  salarySpecialAllowance?: number;
  salaryOtherAllowance?: number;
  hasPf: boolean;
  salaryPf?: number;
  hasHealthInsurance: boolean;
  salaryEsi?: number;
  salaryProfessionalTax?: number;
  salaryTds?: number;
  salaryOtherDeductionLabel?: string;
  salaryOtherDeduction?: number;
  panNumber?: string;
  aadhaarNumber?: string;
  uanNumber?: string;
  esiNumber?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
};

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

function num(row: Record<string, unknown>, key: string): number | undefined {
  const v = row[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return isNaN(n) || n === 0 ? undefined : n;
}

function bool(row: Record<string, unknown>, key: string): boolean {
  return ["YES", "TRUE", "1", "Y"].includes(str(row, key).toUpperCase());
}

export async function parseEmployeeImportFile(file: File): Promise<ImportRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const results: ImportRow[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    const name = str(r, "Name");

    // Skip hint / instruction rows (row 2 in template has hints, not real names)
    if (!name) continue;
    // Skip if looks like a hint row (contains "required" or "format" etc.)
    if (/required|format|e\.g\.|optional|number\)|YES or/i.test(name)) continue;

    const status = str(r, "Status") || "active";

    results.push({
      rowNum: i + 2,
      name,
      employeeCode: str(r, "Employee Code") || undefined,
      phone: str(r, "Phone") || undefined,
      email: str(r, "Email") || undefined,
      role: str(r, "Role") || undefined,
      store: str(r, "Store") || undefined,
      department: str(r, "Department") || undefined,
      designation: str(r, "Designation") || undefined,
      reportingManager: str(r, "Reporting Manager") || undefined,
      joiningDate: str(r, "Joining Date") || undefined,
      employmentStatus: ["active", "on_leave", "inactive"].includes(status) ? status : "active",
      salaryBasic: num(r, "Basic Salary"),
      salaryHra: num(r, "HRA"),
      salarySpecialAllowance: num(r, "Special Allowance"),
      salaryOtherAllowance: num(r, "Other Allowance"),
      hasPf: bool(r, "Has PF"),
      salaryPf: num(r, "PF Amount"),
      hasHealthInsurance: bool(r, "Has Health Insurance"),
      salaryEsi: num(r, "ESI Amount"),
      salaryProfessionalTax: num(r, "Professional Tax"),
      salaryTds: num(r, "TDS"),
      salaryOtherDeductionLabel: str(r, "Other Deduction Label") || undefined,
      salaryOtherDeduction: num(r, "Other Deduction Amount"),
      panNumber: str(r, "PAN") || undefined,
      aadhaarNumber: str(r, "Aadhaar") || undefined,
      uanNumber: str(r, "UAN Number") || undefined,
      esiNumber: str(r, "ESI Number") || undefined,
      bankName: str(r, "Bank Name") || undefined,
      bankAccountNumber: str(r, "Bank Account Number") || undefined,
      bankIfsc: str(r, "Bank IFSC") || undefined,
    });
  }

  return results;
}

// ─── Save to Firestore ────────────────────────────────────────────────────────

export async function importEmployeesToFirestore(
  rows: ImportRow[],
  onProgress?: (done: number, total: number) => void
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const ref = doc(collection(db, "hrEmployees"));
      const code = row.employeeCode ?? null;
      await setDoc(ref, {
        name: row.name,
        email: row.email ?? null,
        phone: row.phone ?? null,
        role: row.role || "employee",
        store: row.store ?? null,
        employeeCode: code,
        biometricId: code,
        department: row.department ?? null,
        designation: row.designation ?? null,
        reportingManager: row.reportingManager ?? null,
        joiningDate: row.joiningDate ?? null,
        employmentStatus: row.employmentStatus ?? "active",
        timesheetEnabled: false,
        salaryBasic: row.salaryBasic ?? null,
        salaryHra: row.salaryHra ?? null,
        salarySpecialAllowance: row.salarySpecialAllowance ?? null,
        salaryOtherAllowance: row.salaryOtherAllowance ?? null,
        hasPf: row.hasPf,
        salaryPf: row.salaryPf ?? null,
        hasHealthInsurance: row.hasHealthInsurance,
        salaryEsi: row.salaryEsi ?? null,
        salaryProfessionalTax: row.salaryProfessionalTax ?? null,
        salaryTds: row.salaryTds ?? null,
        salaryOtherDeductionLabel: row.salaryOtherDeductionLabel ?? null,
        salaryOtherDeduction: row.salaryOtherDeduction ?? null,
        panNumber: row.panNumber ?? null,
        aadhaarNumber: row.aadhaarNumber ?? null,
        uanNumber: row.uanNumber ?? null,
        esiNumber: row.esiNumber ?? null,
        bankName: row.bankName ?? null,
        bankAccountNumber: row.bankAccountNumber ?? null,
        bankIfsc: row.bankIfsc ?? null,
      });
      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed";
      errors.push(`Row ${row.rowNum} (${row.name}): ${msg}`);
    }
    onProgress?.(i + 1, rows.length);
  }

  return { imported, errors };
}
