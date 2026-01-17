"use client";

import {
  FileText,
  FilePlus,
  Receipt,
  ShoppingBasket,
  IndianRupee,
  FileMinus,
  FilePlus2,
  FileSignature,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";

const billingActions = [
  {
    title: "Invoice List",
    description: "View and manage invoices",
    icon: FileText,
    action: "View details »",
    path: "/dashboard/invoice",
  },
  {
    title: "Generate Invoice",
    description: "Generate invoices from orders",
    icon: FilePlus,
    action: "Proceed »",
    path: "/dashboard/billing/generate",
  },
  {
    title: "General Invoice",
    description: "Create general invoices",
    icon: Receipt,
    action: "Proceed »",
    path: "/dashboard/billing/general",
  },
  {
    title: "Generate Counter Invoice",
    description: "POS / Counter invoices",
    icon: ShoppingBasket,
    action: "Proceed »",
    path: "/dashboard/billing/counter",
  },
  {
    title: "Payment Receipt",
    description: "View payment receipts",
    icon: IndianRupee,
    action: "View details »",
    path: "/dashboard/billing/payment-receipt",
  },
  {
    title: "Customer Credit Note",
    description: "Customer credit notes",
    icon: FileMinus,
    action: "View details »",
    path: "/dashboard/billing/customer-credit",
  },
  {
    title: "Customer Debit Note",
    description: "Customer debit notes",
    icon: FilePlus2,
    action: "View details »",
    path: "/dashboard/billing/customer-debit",
  },
  {
    title: "Vendor Debit Note",
    description: "Vendor debit notes",
    icon: FileSignature,
    action: "View details »",
    path: "/dashboard/billing/vendor-debit",
  },
  {
    title: "Payment Entry",
    description: "Add payment entries",
    icon: IndianRupee,
    action: "View details »",
    path: "/dashboard/billing/payment-entry",
  },
];

export default function BillingDashboard() {
  const router = useRouter();

  return (
    <div className="p-8">
      {/* Header */}
      <h1 className="text-2xl font-semibold text-gray-800 mb-10">
        Billing
      </h1>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {billingActions.map((item) => (
          <Card
            key={item.title}
            onClick={() => router.push(item.path)}
            className="cursor-pointer border-none shadow-none hover:scale-[1.02] transition"
          >
            <CardContent className="flex flex-col items-center text-center space-y-3">
              <item.icon className="w-10 h-10 text-sky-500" />
              <h2 className="text-lg font-medium text-sky-600">
                {item.title}
              </h2>
              <p className="text-sm text-gray-500">
                {item.description}
              </p>
              <span className="text-sm text-gray-400 hover:text-sky-600">
                {item.action}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
