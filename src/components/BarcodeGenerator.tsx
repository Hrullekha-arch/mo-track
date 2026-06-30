"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  value: string;
  label?: string;
};

export default function BarcodeGenerator({ value, label }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;

    JsBarcode(svgRef.current, value, {
      format: "CODE128",
      displayValue: true,
      lineColor: "#111827",
      width: 1.6,
      height: 44,
      margin: 8,
      fontSize: 12,
    });
  }, [value]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      {label ? <div className="mb-2 text-sm font-medium text-slate-700">{label}</div> : null}
      <svg ref={svgRef} className="w-full" />
    </div>
  );
}
