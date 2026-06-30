import Link from "next/link";
import type { ReactNode } from "react";
import {
  Boxes,
  ClipboardCheck,
  Home,
  Route,
  ScanLine,
  Settings2,
  Users,
  Wrench,
} from "lucide-react";

const nav = [
  { href: "/mo-designs-fpms", label: "Overview", icon: Home },
  { href: "/mo-designs-fpms/orders/new", label: "New Order", icon: ClipboardCheck },
  { href: "/mo-designs-fpms/approvals", label: "Approvals", icon: ClipboardCheck },
  { href: "/mo-designs-fpms/workshop/scan", label: "Workshop Scan", icon: ScanLine },
  { href: "/mo-designs-fpms/configurations/routing", label: "Routing", icon: Route },
  { href: "/mo-designs-fpms/resources/people", label: "People", icon: Users },
  { href: "/mo-designs-fpms/resources/machinery", label: "Machinery", icon: Wrench },
];

export default function MoDesignsFpmsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-300">MO Designs Factory Flow</div>
            <h1 className="text-2xl font-semibold">MO Designs FPMS</h1>
          </div>
          <div className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-200">
            Customer -&gt; Measurement -&gt; Drawing -&gt; SM -&gt; Barcode -&gt; BOM -&gt; Workshop
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-[250px_1fr]">
        <aside className="rounded-2xl border bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <Settings2 className="h-4 w-4" />
            Modules
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
              href="/mo-designs-fpms/bom/mdf-1001"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              <Boxes className="h-4 w-4" />
              BOM Sample
            </Link>
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
