"use client";

import { Loader2, CheckCircle2, FileText } from "lucide-react";

const steps = [
  { key: "pdf", label: "📄 Generating measurement PDF" },
  { key: "upload", label: "☁️ Saving files to Storage" },
  { key: "sheet", label: "📊 Saving measurement entries" },
  { key: "done", label: "✅ Saved successfully" },
];

export function MeasurementSaveLoader({ step }: { step: string }) {
  return (
    <div className="space-y-4 p-6 text-sm">
      {steps.map((s) => {
        const isActive = s.key === step;
        const isDone =
          steps.findIndex(x => x.key === step) >
          steps.findIndex(x => x.key === s.key);

        return (
          <div key={s.key} className="flex items-center gap-3">
            {isActive && step !== "done" && (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            )}

            {isDone && (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            )}

            {!isActive && !isDone && (
              <FileText className="w-4 h-4 text-gray-400" />
            )}

            <span
              className={`${
                isActive
                  ? "font-medium text-blue-700"
                  : isDone
                  ? "text-green-700"
                  : "text-gray-500"
              }`}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
