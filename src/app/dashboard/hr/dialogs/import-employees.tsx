"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importEmployeesToFirestore, parseEmployeeImportFile, type ImportRow } from "../utils/employee-import";

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
};

type Phase = "upload" | "preview" | "importing" | "done";

export function ImportEmployeesDialog({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => {
    setPhase("upload");
    setRows([]);
    setProgress(0);
    setResult(null);
    setParseError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    try {
      const parsed = await parseEmployeeImportFile(file);
      if (parsed.length === 0) {
        setParseError("No valid employee rows found. Make sure the Name column is filled in.");
        return;
      }
      setRows(parsed);
      setPhase("preview");
    } catch {
      setParseError("Could not read the file. Make sure it is a valid Excel (.xlsx / .xls) file.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    setPhase("importing");
    setProgress(0);
    const res = await importEmployeesToFirestore(rows, (done, total) => {
      setProgress(Math.round((done / total) * 100));
    });
    setResult(res);
    setPhase("done");
    if (res.imported > 0) onImported(res.imported);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <DialogTitle>Import Employees from Excel</DialogTitle>
          <DialogDescription>
            Upload your filled template to add multiple employees at once.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── Upload phase ── */}
          {phase === "upload" && (
            <div
              className="flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50/30 cursor-pointer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
                <FileSpreadsheet className="h-7 w-7 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Drop your Excel file here</p>
                <p className="text-sm text-slate-500 mt-0.5">or click to browse — .xlsx or .xls</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {parseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* ── Preview phase ── */}
          {phase === "preview" && rows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  <span className="text-indigo-700 font-bold">{rows.length}</span> employee{rows.length !== 1 ? "s" : ""} found — review before importing
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={reset} className="gap-1 text-slate-500">
                  <X className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs">#</TableHead>
                        <TableHead className="text-xs">Name</TableHead>
                        <TableHead className="text-xs">Code</TableHead>
                        <TableHead className="text-xs">Role</TableHead>
                        <TableHead className="text-xs">Department</TableHead>
                        <TableHead className="text-xs">Basic</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.rowNum} className="text-xs">
                          <TableCell className="text-slate-400">{row.rowNum}</TableCell>
                          <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                          <TableCell className="text-slate-500">{row.employeeCode || "—"}</TableCell>
                          <TableCell className="text-slate-500">{row.role || "employee"}</TableCell>
                          <TableCell className="text-slate-500">{row.department || "—"}</TableCell>
                          <TableCell className="text-slate-500">
                            {row.salaryBasic ? `₹${row.salaryBasic.toLocaleString()}` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                row.employmentStatus === "inactive"
                                  ? "text-[10px] border-slate-200 bg-slate-50 text-slate-500"
                                  : "text-[10px] border-emerald-200 bg-emerald-50 text-emerald-700"
                              }
                            >
                              {(row.employmentStatus ?? "active").replace("_", " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}

          {/* ── Importing progress ── */}
          {phase === "importing" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
              <p className="text-sm font-medium text-slate-700">Importing employees… {progress}%</p>
              <div className="h-2 w-64 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Done phase ── */}
          {phase === "done" && result && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800">
                    {result.imported} employee{result.imported !== 1 ? "s" : ""} imported successfully
                  </p>
                  <p className="text-sm text-emerald-700 mt-0.5">
                    The employee list has been updated automatically.
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1">
                  <p className="text-sm font-semibold text-red-700">{result.errors.length} row(s) failed:</p>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate-100 gap-2">
          {phase === "done" ? (
            <Button type="button" onClick={handleClose} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              Close
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={phase === "importing"}>
                Cancel
              </Button>
              {phase === "preview" && (
                <Button
                  type="button"
                  onClick={() => void handleImport()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                >
                  <Upload className="h-4 w-4" />
                  Import {rows.length} Employee{rows.length !== 1 ? "s" : ""}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
