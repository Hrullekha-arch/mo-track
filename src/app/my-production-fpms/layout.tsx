import Link from "next/link";
import type { ReactNode } from "react";
import {
  ClipboardList,
  PackageSearch,
  QrCode,
  ScanLine,
  ShoppingBag,
} from "lucide-react";

const nav = [
  { href: "/my-production-fpms", label: "Overview", icon: ShoppingBag },
  { href: "/my-production-fpms/orders/new", label: "New Order", icon: ClipboardList },
  { href: "/my-production-fpms/approvals", label: "Approvals", icon: QrCode },
  { href: "/my-production-fpms/workshop/scan", label: "Workshop Scan", icon: ScanLine },
];

export default function MyProductionFpmsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-300">Factory Flow</div>
            <h1 className="text-2xl font-semibold">My Production FPMS</h1>
          </div>
          <div className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200">
            Customer -&gt; Drawing -&gt; Approval -&gt; Barcode -&gt; BOM -&gt; Workshop
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Flow Navigation
          </div>
          <nav className="space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <Link
              href="/my-production-fpms/bom/ord-1001"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <PackageSearch className="h-4 w-4" />
              BOM Sample
            </Link>
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
