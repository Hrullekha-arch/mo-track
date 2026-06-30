"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  value: string;
  title?: string;
};

export default function BarcodePrinter({ value, title = "Production Barcode" }: Props) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;

    JsBarcode(ref.current, value, {
      format: "CODE128",
      displayValue: true,
      lineColor: "#111827",
      width: 1.7,
      height: 56,
      margin: 10,
      fontSize: 12,
    });
  }, [value]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm print:shadow-none">
      <style jsx>{`
        @media print {
          .print-title {
            color: #000;
          }
        }
      `}</style>
      <div className="print-title mb-3 text-sm font-semibold text-slate-700">{title}</div>
      <svg ref={ref} className="w-full" />
    </div>
  );
}
