"use client";

import { useRouter } from "next/navigation";
import {
  List,
  FilePlus,
  Receipt,
  ShoppingBasket,
  IndianRupee,
  FileMinus,
  FilePlus2,
  FileSignature,
  ArrowRight,
} from "lucide-react";

// ─── Data ────────────────────────────────────────────────────────────────────

type Section = "inv" | "pay" | "note";

interface BillingItem {
  group: Section;
  name: string;
  sub: string;
  icon: React.ElementType;
  badge: string;
  path: string;
}

const billingItems: BillingItem[] = [
  {
    group: "inv",
    name: "Invoice list",
    sub: "Browse all invoices",
    icon: List,
    badge: "View",
    path: "/dashboard/invoice",
  },
  {
    group: "inv",
    name: "Generate invoice",
    sub: "From existing orders",
    icon: FilePlus,
    badge: "Create",
    path: "/dashboard/billing/generate",
  },
  {
    group: "inv",
    name: "General invoice",
    sub: "Freeform billing",
    icon: Receipt,
    badge: "Create",
    path: "/dashboard/billing/general",
  },
  {
    group: "inv",
    name: "Counter invoice",
    sub: "POS & walk-in sales",
    icon: ShoppingBasket,
    badge: "POS",
    path: "/dashboard/billing/counter",
  },
  {
    group: "pay",
    name: "Payment receipt",
    sub: "Receipts & history",
    icon: IndianRupee,
    badge: "View",
    path: "/dashboard/billing/payment-receipt",
  },
  {
    group: "pay",
    name: "Payment entry",
    sub: "Record a payment",
    icon: IndianRupee,
    badge: "Add",
    path: "/dashboard/billing/payment-entry",
  },
  {
    group: "note",
    name: "Customer Details",
    sub: "Issue credit notes",
    icon: FileMinus,
    badge: "Credit",
    path: "/dashboard/Billing/customer",
  },
  {
    group: "note",
    name: "Customer debit",
    sub: "Raise debit notes",
    icon: FilePlus2,
    badge: "Debit",
    path: "/dashboard/Billing/customer-debit",
  },
  {
    group: "note",
    name: "Vendor debit",
    sub: "Vendor adjustments",
    icon: FileSignature,
    badge: "Vendor",
    path: "/dashboard/billing/vendor-debit",
  },
];

// ─── Section config ───────────────────────────────────────────────────────────

const sectionConfig: Record<
  Section,
  { label: string; dotColor: string; iconBg: string; iconStroke: string; badgeBg: string; badgeText: string }
> = {
  inv: {
    label: "Invoices",
    dotColor: "#378ADD",
    iconBg: "#E6F1FB",
    iconStroke: "#185FA5",
    badgeBg: "#E6F1FB",
    badgeText: "#0C447C",
  },
  pay: {
    label: "Payments",
    dotColor: "#1D9E75",
    iconBg: "#E1F5EE",
    iconStroke: "#0F6E56",
    badgeBg: "#E1F5EE",
    badgeText: "#085041",
  },
  note: {
    label: "Credit & debit notes",
    dotColor: "#BA7517",
    iconBg: "#FAEEDA",
    iconStroke: "#854F0B",
    badgeBg: "#FAEEDA",
    badgeText: "#633806",
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionDivider({ section }: { section: Section }) {
  const cfg = sectionConfig[section];
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: cfg.dotColor }}
      />
      <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-gray-400">
        {cfg.label}
      </span>
      <span className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function BillingCard({ item, onClick }: { item: BillingItem; onClick: () => void }) {
  const cfg = sectionConfig[item.group];
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className="group text-left bg-white border border-gray-100 rounded-xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-150 hover:border-gray-200 hover:-translate-y-0.5 active:translate-y-0 active:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      {/* Top row: icon + badge */}
      <div className="flex justify-between items-start">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: cfg.iconBg }}
        >
          <Icon
            size={15}
            strokeWidth={1.7}
            style={{ color: cfg.iconStroke }}
          />
        </div>
        <span
          className="text-[10px] font-medium tracking-[0.04em] px-2 py-0.5 rounded-full"
          style={{ background: cfg.badgeBg, color: cfg.badgeText }}
        >
          {item.badge}
        </span>
      </div>

      {/* Name + description */}
      <div>
        <p className="text-[13px] font-medium text-gray-800 leading-snug mb-0.5">
          {item.name}
        </p>
        <p className="text-[11px] text-gray-400 leading-relaxed">{item.sub}</p>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center border-t border-gray-100 pt-2.5 mt-auto">
        <span className="text-[11px] text-gray-400">Open module</span>
        <div className="w-[22px] h-[22px] rounded-full border border-gray-200 flex items-center justify-center transition-colors group-hover:border-gray-300 group-hover:bg-gray-50">
          <ArrowRight size={10} strokeWidth={2} className="text-gray-400" />
        </div>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BillingDashboard() {
  const router = useRouter();

  const sections: Section[] = ["inv", "pay", "note"];

  return (
    <div
      className="p-8 max-w-4xl"
      style={{ fontFamily: "'Sora', sans-serif" }}
    >
      {/* Google Font import — add to your _document or layout instead */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500&display=swap');`}</style>

      {/* Header */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-gray-400 mb-1.5">
            Finance module
          </p>
          <h1 className="text-[26px] font-medium text-gray-900 tracking-tight leading-none">
            Billing
          </h1>
        </div>

        {/* Stats */}
        <div className="flex gap-2">
          {[
            { val: billingItems.length, lbl: "Modules" },
            { val: sections.length, lbl: "Sections" },
          ].map((s) => (
            <div
              key={s.lbl}
              className="bg-gray-50 rounded-lg px-3.5 py-2.5 text-right"
            >
              <p className="text-[18px] font-medium text-gray-800 leading-none">
                {s.val}
              </p>
              <p className="text-[10px] text-gray-400 mt-1 tracking-[0.04em]">
                {s.lbl}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-8">
        {sections.map((sec) => (
          <div key={sec}>
            <SectionDivider section={sec} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {billingItems
                .filter((i) => i.group === sec)
                .map((item) => (
                  <BillingCard
                    key={item.name}
                    item={item}
                    onClick={() => router.push(item.path)}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}